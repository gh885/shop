package com.shop.platform.aftersale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.aftersale.dto.RefundLineRequest;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.aftersale.service.RefundService;
import com.shop.platform.aftersale.service.RefundTimeoutService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 退款超时线集成验证（真库）：三条超时线各自「到期落成 / 未到期不动 / 条件不满足让位」。
 *
 * <p>时间推进用 SQL 回拨计时列（待处理看 created_at、待寄回看 agreed_at、已寄回看 return_registered_at），
 * 而不是把窗口常量改小：扫的就是生产同一条判定，常量改小测的是另一个系统。
 * 断言吃「这笔单的最终状态」而不是 sweep 返回值——测试库共享，别的用例会混进同一批扫描。
 */
@SpringBootTest
class RefundTimeoutIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private OrderTransitionService transitions;

    @Autowired
    private RefundService refunds;

    @Autowired
    private RefundTimeoutService timeoutService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID orderId;

    private UUID itemId;

    @BeforeEach
    void seed() {
        db.seedActiveUser(userId);
        db.onDeleteBuyerOrderChain(userId);
        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        UUID addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);

        Order created = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 2)), null, null))
                .orders()
                .getFirst();
        orderId = created.getId();
        itemId = jdbc.queryForObject(
                "SELECT id FROM orders.items WHERE order_id = ?::uuid", UUID.class, orderId.toString());
        paymentService.confirm(userId, paymentService.pay(userId, orderId).getId());
        shipWholeOrder(shopId, orderId, "SF", "SF111");
        transitions.receive(userId, orderId);
    }

    private void applyReturn(int quantity) {
        refunds.apply(
                userId,
                orderId,
                RefundType.RETURN_REFUND,
                AfterSaleReason.QUALITY_ISSUE,
                null,
                List.of(new RefundLineRequest(itemId, quantity)));
    }

    private String refundStatus() {
        return jdbc.queryForObject(
                "SELECT status FROM aftersale.refunds WHERE order_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
                String.class,
                orderId.toString());
    }

    private String paymentStatus() {
        return jdbc.queryForObject(
                "SELECT status FROM payment.payments WHERE order_id = ?::uuid", String.class, orderId.toString());
    }

    private String badge() {
        return jdbc.queryForObject(
                "SELECT after_sale_badge FROM orders.orders WHERE id = ?::uuid", String.class, orderId.toString());
    }

    private int totalStock() {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    /** 把退款单出生时刻回拨（= 待处理已停留 n 小时） */
    private void ageCreatedHours(int hours) {
        jdbc.update(
                "UPDATE aftersale.refunds SET created_at = created_at - make_interval(hours => ?) WHERE order_id = ?::uuid",
                hours,
                orderId.toString());
    }

    /** 把「同意」时刻回拨 n 天：待寄回线的计时起点 */
    private void ageAgreedDays(int days) {
        jdbc.update(
                "UPDATE aftersale.refunds SET agreed_at = agreed_at - make_interval(days => ?) WHERE order_id = ?::uuid",
                days,
                orderId.toString());
    }

    /** 把「最近一次回寄登记」时刻回拨 n 天：确认收货线的计时起点 */
    private void ageReturnRegisteredDays(int days) {
        jdbc.update(
                "UPDATE aftersale.refunds SET return_registered_at = return_registered_at - make_interval(days => ?)"
                        + " WHERE order_id = ?::uuid",
                days,
                orderId.toString());
    }

    @Test
    void 卖家48小时未处理_自动同意_退货退款只进待寄回() {
        applyReturn(2);
        ageCreatedHours(49);

        assertTrue(timeoutService.sweepSellerResponse() >= 1);

        assertEquals(RefundStatus.RETURN_PENDING.name(), refundStatus());
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus(), "此时还没退款：货没回来");
        assertEquals("REFUNDING", badge());
    }

    @Test
    void 未满48小时_不动() {
        applyReturn(2);
        ageCreatedHours(47);

        timeoutService.sweepSellerResponse();
        assertEquals(RefundStatus.PENDING.name(), refundStatus());
    }

    @Test
    void 卖家已抢先处理_定时器不重复动作() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        ageCreatedHours(999);

        timeoutService.sweepSellerResponse();
        assertEquals(RefundStatus.RETURN_PENDING.name(), refundStatus());
    }

    @Test
    void 悬挂回寄_到期未填运单号_自动关闭并释放名额() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        ageAgreedDays(8);

        assertTrue(timeoutService.sweepReturnShip() >= 1);

        assertEquals(RefundStatus.CANCELLED.name(), refundStatus());
        assertEquals("NONE", badge(), "未出钱的终态不挂角标");
        // 名额释放：同一订单行可以再开一张（部分唯一索引让位，窗口未过）
        applyReturn(2);
        assertEquals(RefundStatus.PENDING.name(), refundStatus());
    }

    @Test
    void 悬挂回寄_已填运单号_到期也不关() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        ageAgreedDays(8);

        timeoutService.sweepReturnShip();
        assertEquals(RefundStatus.RETURNED.name(), refundStatus());
    }

    @Test
    void 悬挂回寄_未满7天_不动() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        ageAgreedDays(6);

        timeoutService.sweepReturnShip();
        assertEquals(RefundStatus.RETURN_PENDING.name(), refundStatus());
    }

    @Test
    void 已回寄_卖家超10天未确认收货_自动退款并回补() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        assertEquals(3, totalStock());
        ageReturnRegisteredDays(11);

        assertTrue(timeoutService.sweepReturnReceive() >= 1);

        assertEquals(RefundStatus.REFUNDED.name(), refundStatus());
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus());
        assertEquals(5, totalStock(), "货已寄回，回补与人工确认收货同口径");
        assertEquals("REFUNDED", badge());
    }

    @Test
    void 已回寄_未满10天_不动() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        ageReturnRegisteredDays(9);

        timeoutService.sweepReturnReceive();
        assertEquals(RefundStatus.RETURNED.name(), refundStatus());
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus());
    }

    @Test
    void 改过运单号_从最后一次寄出重新起算_不被旧时刻提前判死() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        ageReturnRegisteredDays(11);
        // 覆盖提交把 return_registered_at 刷新到此刻（改错单号、重新寄出的场景）
        refunds.returnGoods(userId, orderId, "SF", "顺丰快递", "SF888");

        timeoutService.sweepReturnReceive();
        assertEquals(RefundStatus.RETURNED.name(), refundStatus());
    }

    @Test
    void 两条退货超时线互斥_未寄回归自动关闭_已寄回归自动退款() {
        applyReturn(2);
        refunds.agree(shopId, orderId);
        ageAgreedDays(30);
        ageCreatedHours(30 * 24);

        // 未填运单号：确认收货扫描不该碰它（货根本没在路上）
        timeoutService.sweepReturnReceive();
        assertEquals(RefundStatus.RETURN_PENDING.name(), refundStatus());

        assertTrue(timeoutService.sweepReturnShip() >= 1, "它归自动关闭管");
        assertEquals(RefundStatus.CANCELLED.name(), refundStatus());
    }
}
