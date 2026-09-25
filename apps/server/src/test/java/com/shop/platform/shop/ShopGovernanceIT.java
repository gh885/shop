package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.ShopListItem;
import com.shop.platform.shop.service.ShopReviewItem;
import com.shop.platform.shop.service.ShopReviewService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
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

    /** 开店并登记全套清理：店铺 + 成员 + 审核记录（默认以本测试的店主身份开） */
    private Shop openShop(String name) {
        return openShop(ownerId, name);
    }

    /** 同上，指定店主——一人一店闸在，一个场景里要两家店就得换人开 */
    private Shop openShop(UUID owner, String name) {
        Shop shop = shopService.createShop(owner, name, null);
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

    private int reviewCount(UUID shopId, ShopReviewStatus status) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM shop.shop_reviews WHERE shop_id = ?::uuid AND status = ?",
                Integer.class,
                shopId.toString(),
                status.name());
        assertNotNull(count);
        return count;
    }

    /** 被驳回的店补材料重新提交：状态回 PENDING_REVIEW、队列多一条 PENDING、上一轮 REJECTED 留痕不动 */
    @Test
    void 被拒店铺重新提交_回到待审并再入队() {
        Shop shop = openShop("被拒可重提店铺");
        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        Shop resubmitted = shopService.resubmitReview(shop.getId(), ownerId, "被拒可重提店铺", null);

        assertEquals(ShopStatus.PENDING_REVIEW.name(), shopStatus(shop.getId()));
        assertEquals(ShopStatus.PENDING_REVIEW, resubmitted.getStatus());
        assertEquals(1, reviewCount(shop.getId(), ShopReviewStatus.PENDING));
        assertEquals(1, reviewCount(shop.getId(), ShopReviewStatus.REJECTED));
    }

    /** 重提只对「当前被驳回」这一态成立：第二次重提拿 409，条件更新的影响行数才是并发真相 */
    @Test
    void 重新提交后再提交_拒绝() {
        Shop shop = openShop("重复重提店铺");
        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");
        shopService.resubmitReview(shop.getId(), ownerId, "重复重提店铺", null);

        BusinessException again = assertThrows(
                BusinessException.class, () -> shopService.resubmitReview(shop.getId(), ownerId, "重复重提店铺", null));
        assertEquals(409, again.getHttpStatus());
        assertEquals(1, reviewCount(shop.getId(), ShopReviewStatus.PENDING)); // 没多入队一条
    }

    /** 审核通过的店不能重提（要改店名走的是另一件事，不是重新审核） */
    @Test
    void 已通过的店铺重提_拒绝() {
        Shop shop = openShop("已通过店铺");
        shopReviewService.approve(reviewId(shop.getId()), staffId);

        BusinessException rejected = assertThrows(
                BusinessException.class, () -> shopService.resubmitReview(shop.getId(), ownerId, "已通过店铺", null));
        assertEquals(409, rejected.getHttpStatus());
        assertEquals(ShopStatus.ACTIVE.name(), shopStatus(shop.getId()));
    }

    /** 只有店主能重提：成员（非 OWNER）拿 403，与自己那家店的状态无关 */
    @Test
    void 外人重提_拒绝() {
        Shop shop = openShop("外人重提店铺");
        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        BusinessException forbidden = assertThrows(
                BusinessException.class,
                () -> shopService.resubmitReview(shop.getId(), UUID.randomUUID(), "外人重提店铺", null));
        assertEquals(403, forbidden.getHttpStatus());
    }

    /** 重提可以改名，但店名全局唯一闸照旧：撞别家店名 400 SHOP_NAME_TAKEN，用自己的原名不冲突 */
    @Test
    void 重提改名撞他店店名_拒绝() {
        openShop(UUID.randomUUID(), "已被占用的名字");
        Shop mine = openShop("我的被拒店铺");
        shopReviewService.reject(reviewId(mine.getId()), staffId, "资质不全");

        BusinessException dup = assertThrows(
                BusinessException.class, () -> shopService.resubmitReview(mine.getId(), ownerId, "已被占用的名字", null));
        assertEquals(400, dup.getHttpStatus());
        assertEquals("SHOP_NAME_TAKEN", dup.getCode());
    }

    /** 驳回理由下发给卖家：被驳回的店在「我的店铺」里带上最近一次理由，重提回待审后就不带了 */
    @Test
    void 我的店铺_被拒带驳回理由_重提后不带() {
        Shop shop = openShop("带驳回理由店铺");
        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        ShopListItem row = shopService.myShops(ownerId).getFirst();
        assertEquals(ShopStatus.REJECTED, row.status());
        assertEquals("资质不全", row.rejectReason());

        shopService.resubmitReview(shop.getId(), ownerId, "带驳回理由店铺", null);
        assertNull(shopService.myShops(ownerId).getFirst().rejectReason());
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

    /**
     * 队列排序（ACC-08「PENDING 优先、新店在前」）。status 列存的是枚举名字符串，照列升序排出来是字母序
     * ——APPROVED 顶在队首、真正等人处理的待审行沉到尾部，所以这一档只能显式给（见
     * {@code ShopReviewMapper.QUEUE_ORDER_BY}；此前就是照列排的）。
     *
     * <p>判据取整页的<b>相对</b>次序而不是绝对位置：这一页里也有别的用例留下的行，位置钉不住，档位先后钉得住。
     */
    @Test
    void 审核队列_待审优先_同档新入队在前() {
        Shop decided = openShop("队列已处置店");
        shopReviewService.approve(reviewId(decided.getId()), staffId);
        openShop(UUID.randomUUID(), "队列待审甲店");
        openShop(UUID.randomUUID(), "队列待审乙店");

        List<ShopReviewItem> rows = shopReviewService
                .pageList(new PageParams(1, PageParams.SIZE_MAX), null)
                .records();

        int lastPending = -1;
        int firstDecided = rows.size();
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).status().isPending()) {
                lastPending = i;
            } else {
                firstDecided = Math.min(firstDecided, i);
            }
        }
        assertTrue(lastPending >= 0, "这一页里没有待审行，用例没跑到队列");
        assertTrue(firstDecided < rows.size(), "这一页里没有已处置行，档位先后没被核对到");
        assertTrue(lastPending < firstDecided, "待审行没有整体排在已处置之前");

        // 同档内新店在前：待审段的入队时刻只许不增
        List<OffsetDateTime> pendingTimes = rows.stream()
                .filter(r -> r.status().isPending())
                .map(ShopReviewItem::createdAt)
                .toList();
        for (int i = 1; i < pendingTimes.size(); i++) {
            assertFalse(pendingTimes.get(i).isAfter(pendingTimes.get(i - 1)), "待审段里旧店排在新店之前");
        }
    }
}
