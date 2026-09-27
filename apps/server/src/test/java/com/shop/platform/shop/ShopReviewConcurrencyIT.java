package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopReviewStatus;
import com.shop.platform.shop.service.ShopReviewService;
import com.shop.platform.shop.service.ShopService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 店铺审批的<b>真并发</b>验证（真库 + 真线程）：一条待审在两个员工同时下手时只能有一个处置生效。
 *
 * <p>为什么必须真起线程：{@code ShopReviewService.decide} 此前的形状是「读记录 → 判 isPending →
 * updateById 写回」，两步之间的窗口只有并发来了才看得见。串行用例（{@code ShopGovernanceIT}
 * 的「同一审核单二次审批」）跑的是<b>闸门已落下之后的响应</b>，跑不出<b>闸门本身在竞争下是否可靠</b>——
 * 而竞争下双双放行留下的是两行结论相反的审计账本，那是事后无从对账的假账。
 */
@SpringBootTest
class ShopReviewConcurrencyIT extends IntegrationTestSupport {

    @Autowired
    private ShopService shopService;

    @Autowired
    private ShopReviewService shopReviewService;

    private final UUID ownerId = UUID.randomUUID();

    private final UUID staffId = UUID.randomUUID();

    /** 开店（PENDING_REVIEW + 审核入队 PENDING 同事务完成）并登记清理 */
    private Shop openShop(String name) {
        Shop shop = shopService.createShop(ownerId, name, null);
        db.onDelete(
                "DELETE FROM audit.audit_records WHERE target_type = 'SHOP_REVIEW' AND target_id IN"
                        + " (SELECT id::text FROM shop.shop_reviews WHERE shop_id = ?::uuid)",
                shop.getId().toString());
        db.onDelete("DELETE FROM shop.shop_reviews WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?", shop.getId());
        db.onDelete("DELETE FROM shop.shops WHERE id = ?", shop.getId());
        return shop;
    }

    private UUID reviewId(UUID shopId) {
        UUID id = jdbc.queryForObject(
                "SELECT id FROM shop.shop_reviews WHERE shop_id = ?::uuid LIMIT 1", UUID.class, shopId.toString());
        assertNotNull(id, "审核单未入队: " + shopId);
        return id;
    }

    private String shopStatus(UUID shopId) {
        String status = jdbc.queryForObject("SELECT status FROM shop.shops WHERE id = ?::uuid", String.class, shopId);
        assertNotNull(status);
        return status;
    }

    private long auditRows(UUID reviewId) {
        Long count = jdbc.queryForObject(
                "SELECT count(*) FROM audit.audit_records WHERE action = 'shop.review.decided' AND target_id = ?",
                Long.class,
                reviewId.toString());
        assertNotNull(count);
        return count;
    }

    /** 两个线程同时处置同一条待审（一个批通过、一个批驳回），返回成功笔数 */
    private int bothDecide(UUID reviewId) throws Exception {
        CountDownLatch startGun = new CountDownLatch(1);
        AtomicInteger succeeded = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            futures.add(pool.submit(() -> {
                startGun.await();
                try {
                    shopReviewService.approve(reviewId, staffId);
                    succeeded.incrementAndGet();
                } catch (BusinessException e) {
                    assertEquals(409, e.getHttpStatus(), "被闸门挡回是 409，不是漏成 500");
                }
                return null;
            }));
            futures.add(pool.submit(() -> {
                startGun.await();
                try {
                    shopReviewService.reject(reviewId, staffId, "资质不全");
                    succeeded.incrementAndGet();
                } catch (BusinessException e) {
                    assertEquals(409, e.getHttpStatus(), "被闸门挡回是 409，不是漏成 500");
                }
                return null;
            }));
            startGun.countDown();
            for (Future<?> f : futures) {
                f.get(30, TimeUnit.SECONDS);
            }
        }
        return succeeded.get();
    }

    /** 核心不变式：一条待审只容得下一个处置，且账本与结论同样只有一行 */
    @Test
    void 并发双审批_只一边落成_账本只一行() throws Exception {
        Shop shop = openShop("并发审批店铺");
        UUID reviewId = reviewId(shop.getId());

        assertEquals(1, bothDecide(reviewId));

        String decidedStatus =
                jdbc.queryForObject("SELECT status FROM shop.shop_reviews WHERE id = ?::uuid", String.class, reviewId);
        assertEquals(1, auditRows(reviewId));
        // 谁赢不确定（取决于谁先抢到闸门），但店铺状态必须与那条结论一致，不许出现「记录通过、店被拒」的分叉
        assertTrue(ShopReviewStatus.APPROVED.name().equals(decidedStatus)
                || ShopReviewStatus.REJECTED.name().equals(decidedStatus));
        assertEquals(
                ShopReviewStatus.APPROVED.name().equals(decidedStatus) ? "ACTIVE" : "REJECTED",
                shopStatus(shop.getId()));
        // 落痕只有一处可写：批的那名员工与时刻
        assertEquals(
                1L,
                jdbc.queryForObject(
                                "SELECT count(*) FROM shop.shop_reviews WHERE id = ?::uuid AND staff_id = ?::uuid"
                                        + " AND decided_at IS NOT NULL",
                                Long.class,
                                reviewId.toString(),
                                staffId.toString())
                        .longValue());
    }

    /**
     * 店铺不在待审那一档时，审批整体回滚：宁可不留痕，也绝不出现「审核记录已通过、店铺卡在别的档位」。
     *
     * <p>这条测的是 {@code decide} 注释里那条承诺的后半截（店铺状态改不成就整体回滚），
     * 窗口出现在「读店铺 → 写店铺」之间，故真库才验得到。
     */
    @Test
    void 店铺已不在待审档_留痕一起回滚() {
        Shop shop = openShop("状态已抢跑的店铺");
        UUID reviewId = reviewId(shop.getId());
        jdbc.update(
                "UPDATE shop.shops SET status = 'DISABLED' WHERE id = ?::uuid",
                shop.getId().toString());

        BusinessException ex =
                assertThrows(BusinessException.class, () -> shopReviewService.approve(reviewId, staffId));

        assertEquals(409, ex.getHttpStatus());
        assertEquals(
                "PENDING",
                jdbc.queryForObject("SELECT status FROM shop.shop_reviews WHERE id = ?::uuid", String.class, reviewId));
        assertEquals("DISABLED", shopStatus(shop.getId()));
        assertEquals(0, auditRows(reviewId));
    }

    @Test
    void 审批留痕与店铺推进同事务生效() {
        Shop shop = openShop("正常审批店铺");

        shopReviewService.reject(reviewId(shop.getId()), staffId, "资质不全");

        assertEquals("REJECTED", shopStatus(shop.getId()));
        assertEquals(1, auditRows(reviewId(shop.getId())));
    }
}
