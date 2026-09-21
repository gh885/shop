package com.shop.platform.shop.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.account.api.UserReadQuery;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
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

    // 我的店铺与邀请
    /** 我的店铺列表：当前用户 ACTIVE 成员身份对应的全部店铺，新店在前 */
    public List<Shop> myShops(UUID userId) {
        List<UUID> shopIds = shopMemberMapper.selectActiveByUser(userId).stream()
                .map(ShopMember::getShopId)
                .toList();
        if (shopIds.isEmpty()) return List.of();
        return shopMapper.selectList(
                new LambdaQueryWrapper<Shop>().in(Shop::getId, shopIds).orderByDesc(Shop::getCreatedAt));
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

    /** 同意邀请：只能确认发给自己的 PENDING 邀请，确认后 ACTIVE 生效 */
    @Transactional
    public ShopMember acceptInvite(UUID memberId, UUID userId) {
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "邀请不存在或已失效");
        Validate.isTrue(member.getUserId().equals(userId), "不能确认发给别人的邀请");
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
     * <p>口径（三条，前端与规则文档以此为准）：
     * <ol>
     *   <li>行不存在（含「已被自己拒掉」——删行后无从区分从未存在）→ 404「邀请不存在或已失效」，与 accept 同一缺席文案，
     *       不返回 204：204 等于对任意 id 承认「这条邀请存在且已被你拒绝」，泄露他人邀请的存在性；
     *   <li>行存在但不是发给自己的 → 400，与 accept 的「不能确认发给别人的邀请」对称；
     *   <li>行存在且已生效（先 accept 再 decline）→ 409「该邀请已处理」，绝不删：拒绝不是退店通道，
     *       ACTIVE 成员离开本店只有店主移除（{@link #removeMember}）这一条路。
     * </ol>
     * 删除带 {@code status = PENDING} 条件（并发闸门）：与并发的 accept 相撞时后到者拿 409，不会把刚生效的成员删掉。
     */
    @Transactional
    public void declineInvite(UUID memberId, UUID userId) {
        // 1. 只能处理发给自己的邀请（缺席与越权同一口径：不泄露别人邀请的存在性）
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "邀请不存在或已失效");
        Validate.isTrue(member.getUserId().equals(userId), "不能拒绝发给别人的邀请");
        // 2. 已生效的成员不能被「拒绝」顶掉（409 与 accept 的重复处理同口径）
        Validate.isTrue(MemberStatus.PENDING.equals(member.getStatus()), 409, "该邀请已处理");
        // 3. 条件删除：状态仍是 PENDING 才删得掉，并发下被抢先 accept 则影响 0 行 → 409
        Validate.isTrue(shopMemberMapper.deletePendingById(memberId) == 1, 409, "该邀请已处理");
        log.info("[SHOP] 成员拒绝邀请, shopId={}, userId={}", member.getShopId(), userId);
    }

    // 买家侧公开读
    /** 店铺公开信息：仅 ACTIVE 可见。待审核/被拒/封禁的店对买家一律 404，不泄露"存在但不可用" */
    public Shop publicShop(UUID shopId) {
        Shop shop = Validate.notNull(shopMapper.selectById(shopId), "店铺不存在");
        Validate.isTrue(shop.isActive(), 404, "店铺不存在");
        return shop;
    }

    // 成员管理（店主操作）
    /** 店铺成员列表：仅本店 ACTIVE 成员可见，拼上成员手机号（跨 schema 只读按 ID 查，禁止 JOIN） */
    public List<ShopMemberItem> members(UUID shopId, UUID operatorId) {
        requireActiveMember(shopId, operatorId);
        List<ShopMember> members = shopMemberMapper.selectByShop(shopId);
        Map<UUID, String> phones = userReadQuery.phonesByIds(
                members.stream().map(ShopMember::getUserId).distinct().toList());
        return members.stream()
                .map(m -> new ShopMemberItem(
                        m.getId(),
                        m.getUserId(),
                        phones.get(m.getUserId()),
                        m.getRole(),
                        m.getStatus(),
                        m.getPermissions()))
                .toList();
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
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "成员不存在");
        Validate.isTrue(member.getShopId().equals(shopId), "成员不属于该店铺");
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
        ShopMember member = Validate.notNull(shopMemberMapper.selectById(memberId), "成员不存在");
        Validate.isTrue(member.getShopId().equals(shopId), "成员不属于该店铺");
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
