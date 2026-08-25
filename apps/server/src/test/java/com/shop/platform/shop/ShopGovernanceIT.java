package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 店铺治理链集成验证（真库）：开店落 PENDING_REVIEW + owner 自动成为 ACTIVE 成员 + 审核入队 →
 * admin 审批（同步事件监听改店铺状态）→ ACTIVE 公开可见 / REJECTED 对外 404。
 * 授权以 shop_members 为准（卖家闸门 isActiveMember），二次审批有幂等守卫。
 */
@SpringBootTest
class ShopGovernanceIT extends IntegrationTestSupport {

    @Autowired
    private com.shop.platform.shop.service.ShopService shopService;

    @Autowired
    private ShopReviewService shopReviewService;

    private final UUID ownerId = UUID.randomUUID();

    private final UUID staffId = UUID.randomUUID();

    /** 开店并登记全套清理：店铺 + 成员 + 事件登记行（开店/审核决定两枚都按 shopId 圈定） */
    private Shop openShop(String name) {
        Shop shop = shopService.createShop(ownerId, name, null);
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + shop.getId() + "%");
        db.onDelete("DELETE FROM admin.shop_reviews WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shops WHERE id = ?", shop.getId());
        return shop;
    }

    /** 审核入队是 AFTER_COMMIT 监听（独立事务），createShop 返回时可能尚未落库——轮询等它出现 */
    private UUID awaitReviewId(UUID shopId) {
        for (int i = 0; i < 100; i++) {
            UUID id = jdbc.queryForObject(
                    "SELECT id FROM admin.shop_reviews WHERE shop_id = ?::uuid LIMIT 1", UUID.class, shopId.toString());
            if (id != null) return id;
            try {
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("interrupted while awaiting review row");
            }
        }
        throw new IllegalStateException("审核单未入队: " + shopId);
    }

    private String shopStatus(UUID shopId) {
        return jdbc.queryForObject("SELECT status FROM shop.shops WHERE id = ?::uuid", String.class, shopId.toString());
    }

    private boolean isOwnerActiveMember(UUID shopId) {
        Boolean active = jdbc.queryForObject(
                "SELECT exists(SELECT 1 FROM shop.shop_members WHERE shop_id = ?::uuid AND user_id = ?::uuid AND status = 'ACTIVE')",
                Boolean.class,
                shopId.toString(),
                ownerId.toString());
        assertNotNull(active);
        return active;
    }

    @Test
    void 开店_店主自动ACTIVE成员_审核入队PENDING() {
        Shop shop = openShop("治理链店铺");
        assertEquals(Shop.STATUS_PENDING_REVIEW, shopStatus(shop.getId()));
        assertTrue(isOwnerActiveMember(shop.getId())); // 授权判断以 shop_members 为准

        awaitReviewId(shop.getId()); // 入队行存在即可，状态断言在审批用例里
        Integer pending = jdbc.queryForObject(
                "SELECT count(*) FROM admin.shop_reviews WHERE shop_id = ?::uuid AND status = ?",
                Integer.class,
                shop.getId().toString(),
                ShopReview.STATUS_PENDING);
        assertEquals(1, pending);
    }

    @Test
    void 审核通过_店铺转ACTIVE_公开可见() {
        Shop shop = openShop("受审通过店铺");
        UUID reviewId = awaitReviewId(shop.getId());

        ShopReview decided = shopReviewService.approve(reviewId, staffId);

        // 同步监听已把店铺推进 ACTIVE；publicShop 只对 ACTIVE 放行
        assertEquals(Shop.STATUS_ACTIVE, shopStatus(shop.getId()));
        assertEquals(ShopReview.STATUS_APPROVED, decided.getStatus());
        assertEquals(staffId, decided.getStaffId());
        assertNotNull(decided.getDecidedAt());
        assertNotNull(shopService.publicShop(shop.getId()));
    }

    @Test
    void 审核拒绝_店铺REJECTED_公开接口404() {
        Shop shop = openShop("受审拒绝店铺");
        UUID reviewId = awaitReviewId(shop.getId());

        ShopReview decided = shopReviewService.reject(reviewId, staffId, "资质不全");

        assertEquals(Shop.STATUS_REJECTED, shopStatus(shop.getId()));
        assertEquals(ShopReview.STATUS_REJECTED, decided.getStatus());
        BusinessException hidden = assertThrows(BusinessException.class, () -> shopService.publicShop(shop.getId()));
        assertEquals(404, hidden.getHttpStatus()); // 拒绝的店对外「不存在」，而非 403
    }

    @Test
    void 同一审核单二次审批_被守卫拦截且状态不被改写() {
        Shop shop = openShop("重复审批店铺");
        UUID reviewId = awaitReviewId(shop.getId());
        shopReviewService.approve(reviewId, staffId);

        BusinessException again =
                assertThrows(BusinessException.class, () -> shopReviewService.reject(reviewId, staffId, "再试一次"));
        assertTrue(again.getHttpStatus() >= 400 && again.getHttpStatus() < 500);
        assertEquals(Shop.STATUS_ACTIVE, shopStatus(shop.getId())); // 状态不被二次改写
    }

    @Test
    void 局外人_不是任何店的成员() {
        Shop shop = openShop("成员闸门店铺");
        Boolean outsiderActive = jdbc.queryForObject(
                "SELECT exists(SELECT 1 FROM shop.shop_members WHERE shop_id = ?::uuid AND user_id = ?::uuid AND status = 'ACTIVE')",
                Boolean.class,
                shop.getId().toString(),
                UUID.randomUUID().toString());
        assertNotNull(outsiderActive);
        assertFalse(outsiderActive);
        // owner 本人在册：闸门只拦外人
        assertTrue(isOwnerActiveMember(shop.getId()));
    }
}
