package com.shop.platform.shop.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.cache.CacheNames;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.mapper.ShopReviewMapper;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.shop.model.ShopStatus;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class ShopService {

    private final ShopMapper shopMapper;
    private final ShopMemberMapper shopMemberMapper;
    private final ShopReviewMapper shopReviewMapper;
    private final UserReadQuery userReadQuery;

    /** 开店：一人一店 + 店名全局唯一闸门通过后，建店（PENDING_REVIEW）+ 店主成为 OWNER 成员 + 同事务入队一条待审记录 */
    @Transactional
    public Shop createShop(UUID ownerId, String name, String logoKey) {
        // 1. 校验店名（controller 已 @Valid，service 兜底）
        Validate.isTrue(name != null && !name.isBlank(), "店名不能为空");

        // 2. 开店闸门（拍板：一人一店）：
        //  2.1 数量：口径取 shop_members 的 OWNER 行数（与授权同源，不看 shops.owner_id 冗余列）；
        //      子账号同闸——别人店的 MEMBER 不占名额也不算资格，判定只看自己名下的 OWNER 身份。
        //      被拒/被封的店仍计数（店铺不物理删除，名额不自动释放），与店名占位同一套存续口径。
        Validate.isTrue(shopMemberMapper.countOwnedShops(ownerId) == 0, "SHOP_LIMIT_EXCEEDED", "每人最多开 1 家店铺，你已开过店了");
        //  2.2 店名：全局唯一（被拒/被封店名仍占位）；先查后插挡不住并发，撞 uk_shops_name 在下面兜成同一个 400
        Validate.isTrue(!shopMapper.existsByName(name), "SHOP_NAME_TAKEN", "店名已被使用，请换一个");

        // 3. 建店：先落 PENDING_REVIEW，平台审核通过才 ACTIVE
        Shop shop = Shop.builder()
                .ownerId(ownerId)
                .name(name)
                .logoKey(logoKey)
                .status(ShopStatus.PENDING_REVIEW)
                .build();
        try {
            shopMapper.insert(shop);
        } catch (DuplicateKeyException e) {
            // 并发下两请求同时过了 2.2 的预检：唯一索引是真相，给和预检一致的 400 而不是冒 500
            throw BusinessException.badRequest("SHOP_NAME_TAKEN", "店名已被使用，请换一个");
        }

        // 4. 店主自动成为 OWNER 成员（授权判断以 shop_members 为准）
        ShopMember owner = ShopMember.builder()
                .shopId(shop.getId())
                .userId(ownerId)
                .role(MemberRole.OWNER)
                .status(MemberStatus.ACTIVE)
                .build();
        shopMemberMapper.insert(owner);

        // 5. 入队审核：与建店同事务落一条 PENDING（审核在本模块闭环）
        shopReviewMapper.insert(ShopReview.builder()
                .shopId(shop.getId())
                .status(ShopReviewStatus.PENDING)
                .build());
        log.info("[SHOP] 开店成功, shopId={}, ownerId={}", shop.getId(), ownerId);
        return shop;
    }

    /**
     * 被驳回的店铺重新提交审核：改店名 / logo 后把状态推回 PENDING_REVIEW，同事务再入队一条待审记录
     * （上一轮那条 REJECTED 留痕不动，一店多条 review 本就是常态）。
     *
     * <p>为什么原地重提而不是「释放名额再开一家」：一人一店闸门数的是 OWNER 身份（ACC-01），被拒的店仍占名额；
     * 只放开名额等于让卖家丢掉店名占位与已上传的 logo，也让平台丢掉上一次审核的记录。原地重提把「补材料」
     * 这件事留在同一行店铺上，代价只是审核队列多一条 PENDING。
     *
     * <p>重提不复活营业：驳回时该店在架商品已级联下架（ACC-72），之后即便审核通过也只把店推回 ACTIVE，
     * 商品仍要卖家自己重新上架（ACC-72 的反向刻意不回上架）。
     */
    @Transactional
    public Shop resubmitReview(UUID shopId, UUID ownerId, String name, String logoKey) {
        requireOwner(shopId, ownerId);
        Validate.isTrue(name != null && !name.isBlank(), "店名不能为空");
        Shop shop = Validate.notNull(shopMapper.selectById(shopId), "店铺不存在");
        // 只有被驳回的店能重提：待审的店已经在队列里，ACTIVE 店无需重审，被封的店走平台解封（ACC-60 仍未落）
        Validate.isTrue(shop.getStatus() == ShopStatus.REJECTED, 409, "只有审核未通过的店铺可以重新提交");
        // 改名要重新过全局唯一闸（本店自己那一行不算冲突）
        Validate.isTrue(!shopMapper.existsOtherNamed(shopId, name), "SHOP_NAME_TAKEN", "店名已被使用，请换一个");

        // 条件更新（WHERE status = REJECTED）是并发闸门：预检与写之间被并发的重提/审核抢先，这里影响 0 行 → 409
        try {
            Validate.isTrue(shopMapper.resubmit(shopId, name, logoKey) == 1, 409, "店铺状态已变化，请刷新后重试");
        } catch (DuplicateKeyException e) {
            // 并发下两家店同时改成同一个名字：uk_shops_name 是真相，给和预检一致的 400
            throw BusinessException.badRequest("SHOP_NAME_TAKEN", "店名已被使用，请换一个");
        }

        // 重新入队：新落一条 PENDING，审核员看到的仍是「店名 + logo + 上一轮驳回理由」那条历史链
        shopReviewMapper.insert(ShopReview.builder()
                .shopId(shopId)
                .status(ShopReviewStatus.PENDING)
                .build());
        shop.setStatus(ShopStatus.PENDING_REVIEW);
        shop.setName(name);
        shop.setLogoKey(logoKey);
        log.info("[SHOP] 被拒店铺重新提交审核, shopId={}, ownerId={}", shopId, ownerId);
        return shop;
    }

    // 我的店铺与邀请
    /** 我的店铺列表：当前用户 ACTIVE 成员身份对应的全部店铺，新店在前；被驳回的店带上最近一次驳回理由 */
    public List<ShopListItem> myShops(UUID userId) {
        List<UUID> shopIds = shopMemberMapper.selectActiveByUser(userId).stream()
                .map(ShopMember::getShopId)
                .toList();
        if (shopIds.isEmpty()) return List.of();
        List<Shop> shops = shopMapper.selectList(
                new LambdaQueryWrapper<Shop>().in(Shop::getId, shopIds).orderByDesc(Shop::getCreatedAt));
        // 理由只查被驳回的那几家：一次 list 里通常 0 或 1 条，不必为没驳回的店翻审核历史
        Map<UUID, String> reasons = shopReviewMapper.latestRejectReasons(shops.stream()
                .filter(s -> s.getStatus() == ShopStatus.REJECTED)
                .map(Shop::getId)
                .toList());
        return shops.stream()
                .map(s -> new ShopListItem(s, reasons.get(s.getId())))
                .toList();
    }

    /** 我的待确认邀请：别人邀我、等我同意的成员记录，拼上店名。只查 PENDING —— 被拒/被撤回的邀请不留行，天然不会挂在这个列表上 */
    public List<ShopInviteItem> myInvites(UUID userId) {
        List<ShopMember> pending = shopMemberMapper.selectPendingByUser(userId);
        if (pending.isEmpty()) return List.of();

        Map<UUID, Shop> shops = shopMapper
                .selectList(new LambdaQueryWrapper<Shop>()
                        .in(
                                Shop::getId,
                                pending.stream().map(ShopMember::getShopId).toList()))
                .stream()
                .collect(Collectors.toMap(Shop::getId, Function.identity()));
        return pending.stream()
                .map(m -> new ShopInviteItem(
                        m.getId(),
                        m.getShopId(),
                        shops.containsKey(m.getShopId())
                                ? shops.get(m.getShopId()).getName()
                                : null,
                        m.getCreatedAt()))
                .toList();
    }

    /**
     * 同意邀请：只能确认发给自己的 PENDING 邀请，确认后 ACTIVE 生效。
     *
     * <p>「不是发给你的」与「没有这条邀请」走同一句话（{@code Validate.requireOwned} → 404「邀请不存在或已失效」）：
     * 曾给 400「不能确认发给别人的邀请」，那等于对任意 memberId 承认「这行存在、只是发给别人的」，邀请 ID 因此可被枚举。
     * 被转发的链接点进来同样只该听到这句话——那句 400 对当事人并没有多出可用的信息（他手上没有任何入口指向别人的邀请）。
     */
    @Transactional
    public ShopMember acceptInvite(UUID memberId, UUID userId) {
        ShopMember member = Validate.requireOwned(
                shopMemberMapper.selectById(memberId), ShopMember::getUserId, userId, "邀请不存在或已失效");
        Validate.isTrue(MemberStatus.PENDING.equals(member.getStatus()), "该邀请已处理");
        member.setStatus(MemberStatus.ACTIVE);
        shopMemberMapper.updateById(member);
        log.info("[SHOP] 成员确认加入, shopId={}, userId={}", member.getShopId(), userId);
        return member;
    }

    /**
     * 拒绝邀请：被邀请人本人拒掉发给自己的 PENDING 邀请 —— 与店主撤回（{@link #removeMember}）走同一条删除路径，
     * 不留 DECLINED 行。
     *
     * <p>为什么删行而不是加一个终态：成员表的 {@code uk_shop_members_shop_user} 是 (shop_id, user_id) 单行唯一，
     * 保留 DECLINED 行会让「再次邀请」必须先改成 PENDING 的更新分支（连带并发口径），而删行后再邀天然可用（无行可撞），
     * 「我的待确认邀请」也只按 PENDING 查——拒绝的行不会挂在列表上，两处目标一次到位，状态词表也不必扩。
     *
     * <p>口径（两条，前端与规则文档以此为准）：
     * <ol>
     *   <li>行不存在（含「已被自己拒掉」——删行后无从区分从未存在）或行存在但不是发给自己的 → 同一句 404
     *       「邀请不存在或已失效」，与 accept 同口径：缺席与越权不给两种答案，否则等于替调用方确认「这条邀请存在」；
     *       不返回 204：204 等于对任意 id 承认「这条邀请存在且已被你拒绝」；
     *   <li>行存在、发给本人且已生效（先 accept 再 decline）→ 409「该邀请已处理」，绝不删：拒绝不是退店通道，
     *       ACTIVE 成员离开本店只有店主移除（{@link #removeMember}）这一条路。
     * </ol>
     * 删除带 {@code status = PENDING} 条件（并发闸门）：与并发的 accept 相撞时后到者拿 409，不会把刚生效的成员删掉。
     */
    @Transactional
    public void declineInvite(UUID memberId, UUID userId) {
        // 1. 只能处理发给自己的邀请：别人的行与没有行回答同一句话
        ShopMember member = Validate.requireOwned(
                shopMemberMapper.selectById(memberId), ShopMember::getUserId, userId, "邀请不存在或已失效");
        // 2. 已生效的成员不能被「拒绝」顶掉（409 与 accept 的重复处理同口径）
        Validate.isTrue(MemberStatus.PENDING.equals(member.getStatus()), 409, "该邀请已处理");
        // 3. 条件删除：状态仍是 PENDING 才删得掉，并发下被抢先 accept 则影响 0 行 → 409
        Validate.isTrue(shopMemberMapper.deletePendingById(memberId) == 1, 409, "该邀请已处理");
        log.info("[SHOP] 成员拒绝邀请, shopId={}, userId={}", member.getShopId(), userId);
    }

    // 买家侧公开读
    /**
     * 店铺公开信息：仅 ACTIVE 可见。待审核/被拒/封禁的店对买家一律 404，不泄露"存在但不可用"。
     *
     * <p>这份读进 Redis 缓存（商详页每次都读它，而店名/logo 几乎不改）。入缓存的只有 ACTIVE 行：404 是抛异常，
     * 异常不入缓存，所以「审核通过」天然不需要失效。反向的「离开 ACTIVE」只有一条路——店主注销时
     * {@code suspend}，它显式 evict（见 ShopAccountDeletionListener）。
     */
    @Cacheable(cacheNames = CacheNames.SHOP_PUBLIC, key = "#shopId")
    public Shop publicShop(UUID shopId) {
        Shop shop = Validate.notNull(shopMapper.selectById(shopId), "店铺不存在");
        Validate.isTrue(shop.isActive(), 404, "店铺不存在");
        return shop;
    }

    // 成员管理（店主操作）
    /**
     * 店铺成员列表：仅本店 ACTIVE 成员可见，拼上成员手机号（跨 schema 只读按 ID 查，禁止 JOIN）。
     * 号码只有本人那行给明文，其余一律掩码（GEN-51）——要看别人的号走 {@link #memberPhone} 逐条索取并留痕。
     */
    public List<ShopMemberItem> members(UUID shopId, UUID operatorId) {
        requireActiveMember(shopId, operatorId);
        List<ShopMember> members = shopMemberMapper.selectByShop(shopId);
        Map<UUID, String> phones = userReadQuery.phonesByIds(
                members.stream().map(ShopMember::getUserId).distinct().toList());
        return members.stream()
                .map(m -> new ShopMemberItem(
                        m.getId(),
                        m.getUserId(),
                        phoneForView(phones.get(m.getUserId()), m.getUserId(), operatorId),
                        m.getRole(),
                        m.getStatus(),
                        m.getPermissions()))
                .toList();
    }

    /**
     * 查看成员电话明文：列表里除本人外都是掩码，真要拨号的场景走这一跳，逐条索取、每次留痕
     * （记「谁看了谁的号」，号码本身不进日志）。闸门与列表同档：本店 ACTIVE 成员，越店与不存在同为 404。
     */
    public String memberPhone(UUID shopId, UUID memberId, UUID operatorId) {
        // 1. 与列表同一道门（非本店成员连「这行存在」都问不出来）
        requireActiveMember(shopId, operatorId);
        ShopMember member =
                Validate.requireOwned(shopMemberMapper.selectById(memberId), ShopMember::getShopId, shopId, "成员不存在");

        // 2. 号码经 account :: api 点查（禁止 JOIN）
        String phone = Validate.present(userReadQuery.phoneById(member.getUserId()), "该成员账号不存在");

        // 3. L3 取用留痕（结构化事件，约定见 docs/conventions/business-event-logging.md）
        BizEvent.of("shop_member.phone_revealed")
                .put("shop_id", shopId)
                .put("member_id", memberId)
                .put("operator_id", operatorId)
                .emit();
        return phone;
    }

    /** 本人那行给明文（自己的号没必要瞒自己），其余按最小必要掩码；查不到号（账号行已不在）保持 null，不编造掩码 */
    private static String phoneForView(String phone, UUID userId, UUID operatorId) {
        if (phone == null || userId.equals(operatorId)) return phone;
        return PhoneNumber.mask(phone);
    }

    /** 店主邀请成员：按手机号找人，落 PENDING 等对方登录后确认（可选携带可授予权限码，默认空集） */
    @Transactional
    public ShopMember invite(UUID shopId, UUID ownerId, String phone, List<String> permissions) {
        // 1. 校验操作者是店主
        requireOwner(shopId, ownerId);

        // 2. 按手机号找人（account :: api 只读，account.users 全局唯一手机号）
        UUID inviteeId = Validate.present(userReadQuery.findIdByPhone(phone), 400, "该手机号还未注册");
        if (inviteeId.equals(ownerId)) {
            throw BusinessException.badRequest("不能邀请自己");
        }

        // 3. 防重：同店同人只能有一条成员记录（唯一索引 uk_shop_members_shop_user 兜底并发）。
        //    被拒/被撤回的邀请不留行（见 declineInvite / removeMember），所以「拒过的人」天然可以再邀，不占坑
        if (shopMemberMapper.existsByShopAndUser(shopId, inviteeId)) {
            throw BusinessException.conflict(null, "对方已是店铺成员或已有待确认邀请");
        }

        // 4. 白名单校验后落 PENDING 邀请（最小权限：不传 = 空集），等对方确认
        List<String> grants = SellerGrants.sanitize(permissions);
        ShopMember member = ShopMember.builder()
                .shopId(shopId)
                .userId(inviteeId)
                .role(MemberRole.MEMBER)
                .status(MemberStatus.PENDING)
                .permissions(grants)
                .build();
        shopMemberMapper.insert(member);
        log.info("[SHOP] 邀请成员, shopId={}, invitee={}, grants={}", shopId, inviteeId, grants);
        return member;
    }

    /** 店主调整子账号权限（全量替换）：OWNER 权限固有不可改；下一请求即生效（判权实时查库） */
    @Transactional
    public void updatePermissions(UUID shopId, UUID memberId, UUID operatorId, List<String> permissions) {
        // 1. 只有店主可调权
        requireOwner(shopId, operatorId);

        // 2. 目标必须是本店 MEMBER（OWNER 权限固有，不存在“改店主权限”）
        //    别店的成员行与不存在的行同一句 404（ACC-79 的口径，与 memberPhone 同门）：400 会把「这行存在、是别家的」说出来
        ShopMember member =
                Validate.requireOwned(shopMemberMapper.selectById(memberId), ShopMember::getShopId, shopId, "成员不存在");
        Validate.isTrue(MemberRole.MEMBER.equals(member.getRole()), "不能修改店主的权限");

        // 3. 白名单校验后全量替换
        member.setPermissions(SellerGrants.sanitize(permissions));
        shopMemberMapper.updateById(member);
        log.info("[SHOP] 调整成员权限, shopId={}, memberId={}, permissions={}", shopId, memberId, member.getPermissions());
    }

    /**
     * 店主移除成员：不能移除自己（店主身份随店铺存续）。
     *
     * <p>一次删除动作承载两种声明式语义，按目标行的状态分：删 ACTIVE 行 = 移除子账号（下一请求即失去卖家权限）；
     * 删 PENDING 行 = <b>撤回邀请</b>——对方还没确认，撤回后这条邀请对它而言就不存在了，「我的待确认邀请」不再列出、
     * 店主可重新邀请（这是店主撤回邀请的唯一通道，不另开端点）。要区分两者看目标行状态，接口语义只有「删掉这一行」。
     * OWNER 行不可删（400），所以店主既移不掉自己，也删不掉店。
     */
    @Transactional
    public void removeMember(UUID shopId, UUID memberId, UUID ownerId) {
        requireOwner(shopId, ownerId);
        ShopMember member =
                Validate.requireOwned(shopMemberMapper.selectById(memberId), ShopMember::getShopId, shopId, "成员不存在");
        if (MemberRole.OWNER.equals(member.getRole())) {
            throw BusinessException.badRequest("不能移除店主");
        }
        shopMemberMapper.deleteById(memberId);
        log.info("[SHOP] 移除成员, shopId={}, memberId={}", shopId, memberId);
    }

    // 内部
    /** 当前用户是否为该店店主，不是则 403 */
    private void requireOwner(UUID shopId, UUID userId) {
        if (!shopMemberMapper.isActiveOwner(shopId, userId)) {
            throw BusinessException.forbidden("只有店主可以执行该操作");
        }
    }

    /** 当前用户是否为该店 ACTIVE 成员，不是则 403 */
    private void requireActiveMember(UUID shopId, UUID userId) {
        if (!shopMemberMapper.isActiveMember(shopId, userId)) {
            throw BusinessException.forbidden("你不是该店铺成员");
        }
    }
}
