package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.ShopReviewService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 店铺治理链集成验证（真库）：开店落 PENDING_REVIEW + owner 自动成为 ACTIVE 成员 + 同事务入队审核 →
 * 平台审批（同事务推进店铺状态）→ ACTIVE 公开可见 / REJECTED 对外 404。
 * 授权以 shop_members 为准（卖家闸门 findActiveMember 装载成员上下文），二次审批有幂等守卫。
 */
@SpringBootTest
class ShopGovernanceIT extends IntegrationTestSupport {

    @Autowired
    private com.shop.platform.shop.service.ShopService shopService;

    @Autowired
    private ShopReviewService shopReviewService;

    private final UUID ownerId = UUID.randomUUID();

    private final UUID staffId = UUID.randomUUID();

    /** 开店并登记全套清理：店铺 + 成员 + 审核记录 */
    private Shop openShop(String name) {
        Shop shop = shopService.createShop(ownerId, name, null);
        db.onDelete("DELETE FROM shop.shop_reviews WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shops WHERE id = ?", shop.getId());
        return shop;
    }

    /** 审核入队与建店同事务：createShop 返回即可查到 */
    private UUID reviewId(UUID shopId) {
        UUID id = jdbc.queryForObject(
                "SELECT id FROM shop.shop_reviews WHERE shop_id = ?::uuid LIMIT 1", UUID.class, shopId.toString());
        assertNotNull(id, "审核单未入队: " + shopId);
        return id;
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
        assertEquals("PENDING_REVIEW", shopStatus(shop.getId()));
        assertTrue(isOwnerActiveMember(shop.getId())); // 授权判断以 shop_members 为准

        reviewId(shop.getId());
        Integer pending = jdbc.queryForObject(
                "SELECT count(*) FROM shop.shop_reviews WHERE shop_id = ?::uuid AND status = ?",
                Integer.class,
                shop.getId().toString(),
                ShopReviewStatus.PENDING.name());
        assertEquals(1, pending);
    }

    /** 店名全局唯一（uk_shops_name + service 预检）：新用户撞已占用的店名被拒，文案带 SHOP_NAME_TAKEN 供前端定位到名输入框 */
    @Test
    void 开店_店名重复_拒绝() {
        openShop("全局唯一店名");
        UUID anotherOwner = UUID.randomUUID();

        BusinessException dup =
                assertThrows(BusinessException.class, () -> shopService.createShop(anotherOwner, "全局唯一店名", null));
        assertEquals(400, dup.getHttpStatus());
        assertEquals("SHOP_NAME_TAKEN", dup.getCode());
    }

    /** 一人一店：判定口径是 shop_members 的 OWNER 行数（子账号同闸——MEMBER 身份不占名额，但自己当过店主就不能再开） */
    @Test
    void 开店_已有店再开_拒绝() {
        openShop("一人一店首店");

        BusinessException again =
                assertThrows(BusinessException.class, () -> shopService.createShop(ownerId, "换个名的第二家店", null));
        assertEquals(400, again.getHttpStatus());
        assertEquals("SHOP_LIMIT_EXCEEDED", again.getCode());
    }

    @Test
    void 审核通过_店铺转ACTIVE_公开可见() {
        Shop shop = openShop("受审通过店铺");

        ShopReview decided = shopReviewService.approve(reviewId(shop.getId()), staffId);

        // 审批同事务已把店铺推进 ACTIVE；publicShop 只对 ACTIVE 放行
        assertEquals(ShopStatus.ACTIVE.name(), shopStatus(shop.getId()));
        assertEquals(ShopReviewStatus.APPROVED, decided.getStatus());
        assertEquals(staffId, decided.getStaffId());
        assertNotNull(decided.getDecidedAt());
        assertNotNull(shopService.publicShop(shop.getId()));
    }

    @Test
    void 审核拒绝_店铺REJECTED_公开接口404() {
        Shop shop = openShop("受审拒绝店铺");

        ShopReview decided = shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        assertEquals(ShopStatus.REJECTED.name(), shopStatus(shop.getId()));
        assertEquals(ShopReviewStatus.REJECTED, decided.getStatus());
        BusinessException hidden = assertThrows(BusinessException.class, () -> shopService.publicShop(shop.getId()));
        assertEquals(404, hidden.getHttpStatus()); // 拒绝的店对外「不存在」，而非 403
    }

    @Test
    void 同一审核单二次审批_被守卫拦截且状态不被改写() {
        Shop shop = openShop("重复审批店铺");
        UUID reviewId = reviewId(shop.getId());
        shopReviewService.approve(reviewId, staffId);

        BusinessException again =
                assertThrows(BusinessException.class, () -> shopReviewService.reject(reviewId, staffId, "再试一次"));
        assertTrue(again.getHttpStatus() >= 400 && again.getHttpStatus() < 500);
        assertEquals(ShopStatus.ACTIVE.name(), shopStatus(shop.getId())); // 状态不被二次改写
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
