package com.shop.platform.shop.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.cache.CacheNames;
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 店铺本体：开店 / 重提审核 / 我的店铺 / 公开读。
 *
 * <p>「成员」在这个模块里只剩店主一种：子账号改造后，店与子账号的绑定写在子账号凭证行上
 * （account 域，见 {@code SubaccountReadQuery}），不在 {@code shop_members} 里。所以
 * {@code shop_members} 现在承载两件事——「一人一店」的名额判定（OWNER 行数）与店铺归属，
 * 店主专属操作的闸门也在这里。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ShopService {

    private final ShopMapper shopMapper;
    private final ShopMemberMapper shopMemberMapper;
    private final ShopReviewMapper shopReviewMapper;

    /** 开店：一人一店 + 店名全局唯一闸门通过后，建店（PENDING_REVIEW）+ 店主成为 OWNER 成员 + 同事务入队一条待审记录 */
    @Transactional
    public Shop createShop(UUID ownerId, String name, String logoKey) {
        // 1. 校验店名（controller 已 @Valid，service 兜底）
        Validate.isTrue(name != null && !name.isBlank(), "店名不能为空");

        // 2. 开店闸门（拍板：一人一店）：
        //  2.1 数量：口径取 shop_members 的 OWNER 行数（与授权同源，不看 shops.owner_id 冗余列）。
        //      被拒/被封的店仍计数（店铺不物理删除，名额不自动释放），与店名占位同一套存续口径。
        //      子账号不占名额：它是凭证行、不是成员行，所以这一格与子账号无关。
        Validate.isTrue(
                shopMemberMapper.countOwnedShops(ownerId) == 0, ErrorCodes.SHOP_LIMIT_EXCEEDED, "每人最多开 1 家店铺，你已开过店了");
        //  2.2 店名：全局唯一（被拒/被封店名仍占位）；先查后插挡不住并发，撞 uk_shops_name 在下面兜成同一个 400
        Validate.isTrue(!shopMapper.existsByName(name), ErrorCodes.SHOP_NAME_TAKEN, "店名已被使用，请换一个");

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
            throw BusinessException.badRequest(ErrorCodes.SHOP_NAME_TAKEN, "店名已被使用，请换一个");
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
        // 只有被驳回的店能重提：待审的店已经在队列里，ACTIVE 店无需重审，被封的店没有卖家自助路，要等平台解封（ACC-60）
        Validate.conflict(shop.getStatus() == ShopStatus.REJECTED, "只有审核未通过的店铺可以重新提交");
        // 改名要重新过全局唯一闸（本店自己那一行不算冲突）
        Validate.isTrue(!shopMapper.existsOtherNamed(shopId, name), ErrorCodes.SHOP_NAME_TAKEN, "店名已被使用，请换一个");

        // 条件更新（WHERE status = REJECTED）是并发闸门：预检与写之间被并发的重提/审核抢先，这里影响 0 行 → 409
        try {
            Validate.conflict(shopMapper.resubmit(shopId, name, logoKey) == 1, "店铺状态已变化，请刷新后重试");
        } catch (DuplicateKeyException e) {
            // 并发下两家店同时改成同一个名字：uk_shops_name 是真相，给和预检一致的 400
            throw BusinessException.badRequest(ErrorCodes.SHOP_NAME_TAKEN, "店名已被使用，请换一个");
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

    // 我的店铺
    /** 我的店铺列表：当前用户名下 OWNER 身份对应的店铺，新店在前；被驳回的店带上最近一次驳回理由 */
    public List<ShopListItem> myShops(UUID userId) {
        List<UUID> shopIds = shopMemberMapper.selectActiveByUser(userId).stream()
                .map(ShopMember::getShopId)
                .toList();
        if (shopIds.isEmpty()) return List.of();
        List<Shop> shops = shopMapper.selectByIdsNewestFirst(shopIds);
        // 理由只查被驳回的那几家：一次 list 里通常 0 或 1 条，不必为没驳回的店翻审核历史
        Map<UUID, String> reasons = shopReviewMapper.latestRejectReasons(shops.stream()
                .filter(s -> s.getStatus() == ShopStatus.REJECTED)
                .map(Shop::getId)
                .toList());
        return shops.stream()
                .map(s -> ShopListItem.from(s, reasons.get(s.getId())))
                .toList();
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
        Validate.present(shop.isActive(), "店铺不存在");
        return shop;
    }

    // 内部
    /** 当前用户是否为该店店主，不是则 403 */
    private void requireOwner(UUID shopId, UUID userId) {
        if (!shopMemberMapper.isActiveOwner(shopId, userId)) {
            throw BusinessException.forbidden("只有店主可以执行该操作");
        }
    }
}
