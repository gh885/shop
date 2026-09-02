package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.AfterSaleType;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 退货退款售后集成验证（真库）：申请 → 卖家同意进入退货流程（未退款）→ 买家回寄填物流（态不变）→
 * 卖家确认收货 → 退款落账 + 库存回补。全程走 PaymentGateway（Mock）真实链路，
 * 语义上区别于仅退款（无回补、一步到 REFUNDED）。
 */
@SpringBootTest
class OrderAfterSaleIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private OrderTransitionService transitions;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    private UUID orderId;

    @BeforeEach
    void seed() {
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        addressId = db.seedAddress(userId);

        // 走到履约闭环（COMPLETED）：下单冻结 → 支付扣实 → 发货 → 确认收货
        Order created = orderService
                .create(userId, new CreateOrderRequest(addressId, null, skuId, 2, null))
                .getFirst();
        orderId = created.getId();
        Payment pending = paymentService.pay(userId, orderId);
        paymentService.confirm(userId, pending.getId());
        transitions.ship(shopId, orderId, new com.shop.platform.order.dto.ShipOrderRequest("顺丰", "SF111"));
        transitions.receive(userId, orderId);
        assertEquals(3, totalStock());
    }

    private int totalStock() {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private String afterSaleStatus() {
        return jdbc.queryForObject(
                "SELECT after_sale_status FROM orders.orders WHERE id = ?::uuid", String.class, orderId.toString());
    }

    @Test
    void 退货退款全链路_同意后未退款_回寄后收货退款并回补库存() {
        // 申请退货退款 → APPLYING
        transitions.applyAfterSale(userId, orderId, AfterSaleType.RETURN_REFUND, "质量不行");
        assertEquals(AfterSaleStatus.APPLYING.name(), afterSaleStatus());

        // 卖家同意 → 进入退货流程 RETURNING（此时未退款，流水仍 SUCCESS）
        transitions.agreeAfterSale(shopId, orderId);
        assertEquals(AfterSaleStatus.RETURNING.name(), afterSaleStatus());
        assertEquals(
                PaymentStatus.SUCCESS.name(),
                jdbc.queryForObject(
                        "SELECT status FROM payment.payments WHERE order_id = ?::uuid",
                        String.class,
                        orderId.toString()));
        assertEquals(3, totalStock()); // 未退款也未回补

        // 买家回寄填物流：态不变（仍 RETURNING），只落物流单号
        transitions.returnGoods(userId, orderId, "中通", "ZT999");
        assertEquals(AfterSaleStatus.RETURNING.name(), afterSaleStatus());
        String logistics = jdbc.queryForObject(
                "SELECT return_logistics_company || '|' || return_tracking_no FROM orders.orders WHERE id = ?::uuid",
                String.class,
                orderId.toString());
        assertEquals("中通|ZT999", logistics);

        // 卖家确认收货 → REFUNDED：退款落账（走网关）+ 库存回补（货回来了 3 → 5）
        transitions.receiveReturn(shopId, orderId);
        assertEquals(AfterSaleStatus.REFUNDED.name(), afterSaleStatus());
        assertEquals(5, totalStock());
        assertEquals(
                PaymentStatus.REFUNDED.name(),
                jdbc.queryForObject(
                        "SELECT status FROM payment.payments WHERE order_id = ?::uuid",
                        String.class,
                        orderId.toString()));
        assertNotNull(jdbc.queryForObject(
                "SELECT refund_gateway_no FROM payment.payments WHERE order_id = ?::uuid",
                String.class,
                orderId.toString()));

        // 已退款终态：再确认收货应 409，审计不重复记
        int logsAfterRefund = logCount();
        BusinessException ex = assertThrows(BusinessException.class, () -> transitions.receiveReturn(shopId, orderId));
        assertEquals(409, ex.getHttpStatus());
        assertEquals(logsAfterRefund, logCount()); // 冲突不落新审计行
        assertTrue(true);
    }

    private int logCount() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM orders.order_status_log WHERE order_id = ?::uuid",
                Integer.class,
                orderId.toString());
    }
}
