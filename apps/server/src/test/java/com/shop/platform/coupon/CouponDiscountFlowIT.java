package com.shop.platform.coupon;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponCommand;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.coupon.model.CouponType;
import com.shop.platform.coupon.service.CouponClaimService;
import com.shop.platform.coupon.service.CouponTemplateService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 折扣券（DISCOUNT）一期闭环集成验证（真库）：补齐 {@link CouponFlowIT} 只走满减券留下的两格——
 * 建券条款（CPN-65：折率 + 封顶必填、面额留空）与结算链路的实减额封顶（{@code CouponFaceValue} 两段封顶 +
 * {@code CouponCommand.lock} 的封顶闸门）。满减券的这两件事 CouponFlowIT 已验，这里专测折扣券那条分支。
 *
 * <p>数据自建自清；券表按 shopId 圈定登记清理，下单链路按 userId 整链回收。
 */
@SpringBootTest
class CouponDiscountFlowIT extends IntegrationTestSupport {

    @Autowired
    private CouponTemplateService couponTemplateService;

    @Autowired
    private CouponClaimService couponClaimService;

    @Autowired
    private CouponCommand couponCommand;

    @Autowired
    private OrderService orderService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    /** 建一个在售 SKU（单价 1000 分）与买家账号、地址，并登记清理 */
    private void seed() {
        db.seedActiveUser(userId);
        db.onDelete("DELETE FROM coupon.coupon_templates WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM coupon.user_coupons WHERE shop_id = ?::uuid", shopId.toString());
        db.onDelete("DELETE FROM coupon.coupon_usages WHERE shop_id = ?::uuid", shopId.toString());
        db.onDeleteBuyerOrderChain(userId);
        skuId = db.seedOnSaleSku(shopId, 1000, 10);
        addressId = db.seedAddress(userId);
    }

    /** 建折扣券模板：满 thresholdFen 按 rate 打折、最高减 maxFen（分），总量 total */
    private UUID seedDiscount(BigDecimal rate, long thresholdFen, long maxFen, int total) {
        OffsetDateTime now = OffsetDateTime.now();
        return couponTemplateService
                .create(
                        shopId,
                        new CreateCouponTemplateRequest(
                                "折扣券",
                                CouponType.DISCOUNT,
                                Money.cny(thresholdFen),
                                null,
                                rate,
                                Money.cny(maxFen),
                                total,
                                now.minusMinutes(1),
                                now.plusDays(7),
                                null))
                .template()
                .getId();
    }

    private UUID claimDiscount(BigDecimal rate, long maxFen) {
        return couponClaimService
                .claim(userId, seedDiscount(rate, 0, maxFen, 10))
                .coupon()
                .getId();
    }

    private CheckoutPreview.Group preview(int quantity, UUID couponId) {
        return orderService
                .preview(userId, new PreviewOrderRequest(addressId, lines(quantity), List.of(couponId)))
                .groups()
                .getFirst();
    }

    private List<OrderLineRequest> lines(int quantity) {
        return List.of(new OrderLineRequest(skuId, quantity));
    }

    private Order createOrder(int quantity, UUID couponId) {
        return orderService
                .create(
                        userId,
                        new CreateOrderRequest(UUID.randomUUID(), addressId, lines(quantity), List.of(couponId), null))
                .orders()
                .getFirst();
    }

    private String couponStatus(UUID couponId) {
        return jdbc.queryForObject(
                "SELECT status FROM coupon.user_coupons WHERE id = ?::uuid", String.class, couponId.toString());
    }

    @Nested
    class 建券条款 {
        @Test
        void 折扣券落库_带折率与封顶_面额留空() {
            seed();
            UUID templateId = seedDiscount(new BigDecimal("0.75"), 0, 900, 10);

            var row = jdbc.queryForMap(
                    "SELECT type, discount_amount, discount_rate, max_discount_amount FROM coupon.coupon_templates WHERE id = ?::uuid",
                    templateId.toString());

            assertEquals("DISCOUNT", row.get("type"));
            assertNull(row.get("discount_amount"), "折扣券没有定值面额（面值随基数变，CPN-65）");
            assertEquals(0, new BigDecimal("0.75").compareTo((BigDecimal) row.get("discount_rate")));
            assertEquals(900L, ((Number) row.get("max_discount_amount")).longValue());
        }

        @Test
        void 缺折率_400() {
            seed();
            OffsetDateTime now = OffsetDateTime.now();
            var ex = assertThrows(
                    BusinessException.class,
                    () -> couponTemplateService.create(
                            shopId,
                            new CreateCouponTemplateRequest(
                                    "缺折率",
                                    CouponType.DISCOUNT,
                                    Money.cny(0),
                                    null,
                                    null,
                                    Money.cny(900),
                                    10,
                                    now.minusMinutes(1),
                                    now.plusDays(7),
                                    null)));
            assertEquals(400, ex.getHttpStatus());
            assertTrue(ex.getDetail().contains("折扣率"));
        }

        @Test
        void 缺封顶_400() {
            seed();
            OffsetDateTime now = OffsetDateTime.now();
            var ex = assertThrows(
                    BusinessException.class,
                    () -> couponTemplateService.create(
                            shopId,
                            new CreateCouponTemplateRequest(
                                    "缺封顶",
                                    CouponType.DISCOUNT,
                                    Money.cny(0),
                                    null,
                                    new BigDecimal("0.5"),
                                    null,
                                    10,
                                    now.minusMinutes(1),
                                    now.plusDays(7),
                                    null)));
            assertEquals(400, ex.getHttpStatus());
            assertTrue(ex.getDetail().contains("最高减免"));
        }

        @Test
        void 折率不小于一_400() {
            seed();
            OffsetDateTime now = OffsetDateTime.now();
            var ex = assertThrows(
                    BusinessException.class,
                    () -> couponTemplateService.create(
                            shopId,
                            new CreateCouponTemplateRequest(
                                    "无效折率",
                                    CouponType.DISCOUNT,
                                    Money.cny(0),
                                    null,
                                    new BigDecimal("1.0"),
                                    Money.cny(900),
                                    10,
                                    now.minusMinutes(1),
                                    now.plusDays(7),
                                    null)));
            assertEquals(400, ex.getHttpStatus());
        }
    }

    @Nested
    class 结算实减额封顶 {
        @Test
        void 未触封顶_按折率打折() {
            seed();
            // 打 8 折：round(2000 × (1 − 0.8)) = 400，封顶给到用不完
            UUID couponId = claimDiscount(new BigDecimal("0.8"), 100000);

            CheckoutPreview.Group group = preview(2, couponId);

            assertEquals(Money.cny(2000), group.itemAmount());
            assertEquals(Money.cny(400), group.discountAmount());
            assertEquals(Money.cny(1600), group.payAmount());
        }

        @Test
        void 触封顶_第一段取封顶() {
            seed();
            // 打 5 折本减 1000，封顶 600 → 600
            UUID couponId = claimDiscount(new BigDecimal("0.5"), 600);

            CheckoutPreview.Group group = preview(2, couponId);

            assertEquals(Money.cny(600), group.discountAmount());
            assertEquals(Money.cny(1400), group.payAmount());
        }

        @Test
        void 下单_折扣券实减额落订单快照_并定格占用() {
            seed();
            UUID couponId = claimDiscount(new BigDecimal("0.8"), 100000);

            Order order = createOrder(2, couponId);

            assertEquals(2000L, order.getItemAmount());
            assertEquals(400L, order.getDiscountAmount());
            assertEquals(1600L, order.getPayAmount());
            assertEquals(couponId, order.getUserCouponId());
            assertEquals("LOCKED", couponStatus(couponId));
            // 流水记的是本单实际减免额（锁定那刻定格），不是面额
            Integer locked = jdbc.queryForObject(
                    "SELECT discount_amount FROM coupon.coupon_usages WHERE user_coupon_id = ?::uuid AND action = 'LOCK'",
                    Integer.class,
                    couponId.toString());
            assertEquals(400, locked);
        }
    }

    @Nested
    class 锁定封顶闸门 {
        @Test
        void 实减超过折扣封顶_被拒() {
            seed();
            // 折扣券的定值上界是 max_discount_amount（不是面额）：实减 601 > 封顶 600 当场拦下
            UUID couponId = claimDiscount(new BigDecimal("0.5"), 600);

            var ex = assertThrows(
                    BusinessException.class,
                    () -> couponCommand.lock(couponId, userId, shopId, UUID.randomUUID(), Money.cny(601)));
            assertEquals(400, ex.getHttpStatus());
            assertTrue(ex.getDetail().contains("超过券面额"));
        }

        @Test
        void 实减恰等封顶_通过闸门并定格() {
            seed();
            UUID couponId = claimDiscount(new BigDecimal("0.5"), 600);
            UUID orderId = UUID.randomUUID();

            couponCommand.lock(couponId, userId, shopId, orderId, Money.cny(600));

            assertEquals("LOCKED", couponStatus(couponId));
            assertEquals(600, (int) jdbc.queryForObject(
                    "SELECT applied_discount_amount FROM coupon.user_coupons WHERE id = ?::uuid",
                    Integer.class,
                    couponId.toString()));
        }
    }
}
