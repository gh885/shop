package com.shop.platform.aftersale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.aftersale.api.CompensationCommand;
import com.shop.platform.aftersale.dto.RefundLineRequest;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.RefundAvailableAction;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.aftersale.service.RefundService;
import com.shop.platform.aftersale.service.RefundView;
import com.shop.platform.aftersale.service.SellerRefundItem;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTimeout;
import com.shop.platform.order.service.OrderTimeoutService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.payment.mapper.Payment;
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
 * 退款单集成验证（真库）：行级退款、十态机、账本与角标、订单取消自动退款、补偿。
 *
 * <p>全程走 PaymentGateway（Mock）真实链路：退款单本体在 aftersale.refunds，行数量与金额落 orders.items，
 * 资金态在 payment.payments——mock 掉任何一方，这条链就只剩形状相同。
 *
 * <p>退款单与「工单」的关键差别在<b>行</b>：一次退款只退指定的订单行与件数，金额按行实付摊，运费单独成行。
 * 因此本类按行断言，而不是只看整单一个数。
 */
@SpringBootTest
class RefundFlowIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private OrderTransitionService transitions;

    @Autowired
    private RefundService refunds;

    @Autowired
    private CompensationCommand compensationCommand;

    /** 自动确认收货那条超时线：退款未决时让位给它 */
    @Autowired
    private OrderTimeoutService timeouts;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID orderId;

    private UUID itemId;

    private UUID addressId;

    @BeforeEach
    void seed() {
        // 下单入口的账号闸门要求真实 ACTIVE 账号（幽灵 uuid 会被 403 USER_DISABLED 拒单）
        db.seedActiveUser(userId);
        db.onDeleteBuyerOrderChain(userId);
        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);

        // 走到履约闭环（COMPLETED）：下单冻结 → 支付扣实 → 发货 → 确认收货
        orderId = createOrder(2, "SF", "SF111", true);
        itemId = itemIdOf(orderId);
        assertEquals(3, totalStock());
    }

    /** 下一单并走到指定阶段：ship=是否发货，receive=是否确认收货 */
    private UUID createOrder(int quantity, String carrier, String trackingNo, boolean receive) {
        Order created = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(),
                                addressId,
                                List.of(new OrderLineRequest(skuId, quantity)),
                                null,
                                null))
                .orders()
                .getFirst();
        UUID id = created.getId();
        Payment pending = paymentService.pay(userId, id);
        paymentService.confirm(userId, pending.getId());
        if (carrier != null) {
            shipWholeOrder(shopId, id, carrier, trackingNo);
        }
        if (receive) {
            transitions.receive(userId, id);
        }
        return id;
    }

    private UUID itemIdOf(UUID id) {
        return jdbc.queryForObject("SELECT id FROM orders.items WHERE order_id = ?::uuid", UUID.class, id.toString());
    }

    private int totalStock() {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private String refundStatus(UUID id) {
        return jdbc.queryForObject(
                "SELECT status FROM aftersale.refunds WHERE order_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
                String.class,
                id.toString());
    }

    private String badge(UUID id) {
        return jdbc.queryForObject(
                "SELECT after_sale_badge FROM orders.orders WHERE id = ?::uuid", String.class, id.toString());
    }

    private String tradeBadge(UUID id) {
        return jdbc.queryForObject(
                "SELECT t.after_sale_badge FROM orders.trades t JOIN orders.orders o ON o.trade_id = t.id"
                        + " WHERE o.id = ?::uuid",
                String.class,
                id.toString());
    }

    private String paymentStatus(UUID id) {
        return jdbc.queryForObject(
                "SELECT status FROM payment.payments WHERE order_id = ?::uuid", String.class, id.toString());
    }

    private long paymentRefunded(UUID id) {
        return jdbc.queryForObject(
                "SELECT refunded_amount FROM payment.payments WHERE order_id = ?::uuid", Long.class, id.toString());
    }

    private long orderRefunded(UUID id) {
        return jdbc.queryForObject(
                "SELECT refunded_amount FROM orders.orders WHERE id = ?::uuid", Long.class, id.toString());
    }

    private String orderStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM orders.orders WHERE id = ?::uuid", String.class, id.toString());
    }

    private String tradeStatus(UUID id) {
        return jdbc.queryForObject(
                "SELECT t.status FROM orders.trades t JOIN orders.orders o ON o.trade_id = t.id WHERE o.id = ?::uuid",
                String.class,
                id.toString());
    }

    private String tradeClosedReason(UUID id) {
        return jdbc.queryForObject(
                "SELECT t.closed_reason FROM orders.trades t JOIN orders.orders o ON o.trade_id = t.id"
                        + " WHERE o.id = ?::uuid",
                String.class,
                id.toString());
    }

    private RefundView apply(UUID id, RefundType type, AfterSaleReason reason, int quantity, String note) {
        UUID item = itemIdOf(id);
        return refunds.apply(userId, id, type, reason, note, List.of(new RefundLineRequest(item, quantity)));
    }

    // ---------------------------------------------------------------- 退货退款

    @Test
    void 退货退款全链路_同意只进待寄回_收货才退款并回补() {
        // 申请：退款单待处理，订单/主订单角标同步为退款中，动作集只有撤销
        RefundView applied = apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 2, "质量不行");
        assertEquals(RefundStatus.PENDING.name(), refundStatus(orderId));
        assertEquals(RefundStatus.PENDING, applied.status());
        assertEquals(2000L, applied.amount().amount());
        assertEquals(List.of(RefundAvailableAction.CANCEL), applied.availableActions());
        assertEquals("REFUNDING", badge(orderId));
        assertEquals("REFUNDING", tradeBadge(orderId));

        // 同一订单行已有进行中的退款：并发/重复申请撞行级唯一索引，409
        BusinessException dup = assertThrows(
                BusinessException.class,
                () -> apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 2, null));
        assertEquals(409, dup.getHttpStatus());

        // 卖家同意 → 待寄回：此时一分钱没退，流水仍是 SUCCESS，库存仍是被扣实后的 3
        refunds.agree(shopId, orderId);
        assertEquals(RefundStatus.RETURN_PENDING.name(), refundStatus(orderId));
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus(orderId));
        assertEquals(3, totalStock());
        assertEquals(
                List.of(RefundAvailableAction.CANCEL, RefundAvailableAction.RETURN_GOODS),
                refunds.buyerDetailView(userId, orderId).availableActions());

        // 买家回寄：状态到已寄回，回寄包裹进 logistics（RETURN 方向），退款单两列是展示投影
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        assertEquals(RefundStatus.RETURNED.name(), refundStatus(orderId));
        assertEquals(
                "RETURN|中通快递|DISPATCHED",
                jdbc.queryForObject(
                        "SELECT direction || '|' || carrier_name || '|' || status FROM logistics.shipments"
                                + " WHERE tracking_no = 'ZT999'",
                        String.class),
                "回寄包裹与正向包裹同一套模型：能接推送、能被轮询、能展示轨迹");
        assertEquals(
                "中通快递|ZT999",
                jdbc.queryForObject(
                        "SELECT return_carrier_name || '|' || return_tracking_no FROM aftersale.refunds"
                                + " WHERE order_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
                        String.class,
                        orderId.toString()));

        // 卖家确认收货 → 已退款：钱经渠道退回、行账本改、库存回补（3 → 5）、角标已退款
        refunds.receiveReturn(shopId, orderId);
        assertEquals(RefundStatus.REFUNDED.name(), refundStatus(orderId));
        assertEquals("REFUNDED", badge(orderId));
        assertEquals("REFUNDED", tradeBadge(orderId));
        assertEquals(2000L, orderRefunded(orderId));
        assertEquals(2000L, paymentRefunded(orderId));
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus(orderId));
        assertEquals(5, totalStock());
        // 退款成功一条执行记录（append-only），渠道退款单号落在这里与流水上
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM aftersale.refund_executions e JOIN aftersale.refunds r ON r.id = e.refund_id"
                                + " WHERE r.order_id = ?::uuid AND e.success",
                        Integer.class,
                        orderId.toString()));
        // 整单退满 + 全部子订单终态 ⇒ 主订单全额退款关单（§8）
        assertEquals("CLOSED", tradeStatus(orderId));
        assertEquals("FULL_REFUND", tradeClosedReason(orderId));

        // 已退款终态：再确认收货 409（没有进行中的单）
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> refunds.receiveReturn(shopId, orderId))
                        .getHttpStatus());
    }

    @Test
    void 部分退货退款_两次退满_金额按行实付摊且最后一次收口() {
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, "先退一件");
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT001");
        refunds.receiveReturn(shopId, orderId);

        assertEquals(1000L, orderRefunded(orderId));
        assertEquals("REFUNDED", badge(orderId));
        assertEquals("COMPLETED", orderStatus(orderId), "退了一件不等于整单退完，履约态不倒退");
        assertEquals("PAID", tradeStatus(orderId), "没退满，主订单不关");

        // 剩下的一件再退：行上已没有未完结的退款（终态放闸），可以再次申请
        assertEquals(
                List.of(RefundAvailableAction.REAPPLY),
                refunds.buyerDetailView(userId, orderId).availableActions());
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, "退最后一件");
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT002");
        refunds.receiveReturn(shopId, orderId);

        assertEquals(2000L, orderRefunded(orderId));
        assertEquals(2000L, paymentRefunded(orderId));
        assertEquals("CLOSED", tradeStatus(orderId));
    }

    // ---------------------------------------------------------------- 取消与补偿

    @Test
    void 已付款订单取消_自动整单退款_订单转已取消且主订单全额退款关单() {
        UUID cancelId = createOrder(1, null, null, false);
        assertEquals("PAID", orderStatus(cancelId));
        int stockAfterPay = totalStock();

        transitions.cancel(userId, cancelId, "不想要了");

        assertEquals("CANCELLED", orderStatus(cancelId));
        assertEquals("REFUNDED", refundStatus(cancelId), "取消必须同事务留下已完成的退款单（INV-19）");
        assertEquals("REFUNDED", badge(cancelId));
        assertEquals(1000L, orderRefunded(cancelId));
        assertEquals(1000L, paymentRefunded(cancelId));
        assertEquals(stockAfterPay + 1, totalStock(), "取消回补库存：货从未发出，仍在卖家手里");
        assertEquals("CLOSED", tradeStatus(cancelId));
        assertEquals("FULL_REFUND", tradeClosedReason(cancelId));
    }

    @Test
    void 补偿_货留买家只退钱_计入已补偿且不影响已退额() {
        UUID compensationId = compensationCommand.grant(orderId, Money.ofFen(500, Money.CNY), "物流延误补偿");

        assertEquals(
                "COMPENSATION",
                jdbc.queryForObject(
                        "SELECT type FROM aftersale.refunds WHERE id = ?::uuid",
                        String.class,
                        compensationId.toString()));
        assertEquals("REFUNDED", refundStatus(orderId));
        assertEquals(0L, orderRefunded(orderId), "补偿不占退款额度（§6.3）");
        assertEquals(
                500L,
                jdbc.queryForObject(
                        "SELECT compensated_amount FROM orders.orders WHERE id = ?::uuid",
                        Long.class,
                        orderId.toString()));
        assertEquals(500L, paymentRefunded(orderId), "钱确实退出去了一笔");
        assertEquals("COMPENSATED", badge(orderId));
        assertEquals(3, totalStock(), "补偿不涉及货，库存不动");
        assertEquals("SUCCESS", paymentStatus(orderId), "只退了 500 / 2000，支付流水不整笔转已退款");

        // 模型级上限：退出去的钱（退款 + 补偿）不能超过实付
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> compensationCommand.grant(orderId, Money.ofFen(2000, Money.CNY), "超额补偿"))
                        .getHttpStatus());
    }

    // ---------------------------------------------------------------- 准入与动作

    @Test
    void 待发货不可申请退款_越权申请与越店处理一律404() {
        UUID paidId = createOrder(1, null, null, false);
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> apply(paidId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, null))
                        .getHttpStatus(),
                "待发货的出口是取消退款，不开第二条退款通道");

        assertEquals(
                404,
                assertThrows(
                                BusinessException.class,
                                () -> refunds.apply(
                                        UUID.randomUUID(),
                                        orderId,
                                        RefundType.RETURN_REFUND,
                                        AfterSaleReason.QUALITY_ISSUE,
                                        null,
                                        List.of(new RefundLineRequest(itemId, 1))))
                        .getHttpStatus());

        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, null);
        assertEquals(
                404,
                assertThrows(BusinessException.class, () -> refunds.reject(UUID.randomUUID(), orderId, "不是我的单"))
                        .getHttpStatus());
    }

    @Test
    void 仅退款只能退未发货额度_全部发出后申请即409() {
        // 这一单两件全部发出、已签收：没有「不会再交付的货」，仅退款没有可退数量（§8）
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> apply(orderId, RefundType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, 1, null))
                        .getHttpStatus());
        assertEquals("NONE", badge(orderId));
    }

    @Test
    void 退款未决时自动确认收货让位_退款撤销后才落完成() {
        UUID shippedId = createOrder(1, "SF", "SF222", false);
        assertEquals("SHIPPED", orderStatus(shippedId));

        apply(shippedId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, "包裹破损，已拒收");
        jdbc.update(
                "UPDATE orders.orders SET receive_expire_at = now() - interval '1 minute' WHERE id = ?::uuid",
                shippedId.toString());
        timeouts.sweep(OrderTimeout.RECEIVE);
        assertEquals("SHIPPED", orderStatus(shippedId), "有未完结退款时系统不替买家宣布收货");

        refunds.cancel(userId, shippedId);
        assertEquals("NONE", badge(shippedId));
        timeouts.sweep(OrderTimeout.RECEIVE);
        assertEquals("COMPLETED", orderStatus(shippedId));
    }

    @Test
    void 拒绝后重新申请放行_拒绝理由随买家详情下发() {
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, "尺码不合");
        assertNull(refunds.buyerDetailView(userId, orderId).rejectReason());

        refunds.reject(shopId, orderId, "商品无质量问题，鉴定通过");

        assertEquals(RefundStatus.REJECTED.name(), refundStatus(orderId));
        assertEquals("NONE", badge(orderId), "未出钱的终态不挂角标");
        assertEquals("商品无质量问题，鉴定通过", refunds.buyerDetailView(userId, orderId).rejectReason());
        assertEquals(
                List.of(RefundAvailableAction.REAPPLY),
                refunds.buyerDetailView(userId, orderId).availableActions());
        assertEquals(List.of(), refunds.sellerDetailView(shopId, orderId).availableActions());

        // 重新申请：拒绝不伤买家利益，窗口内再开一张
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 2, "再申请一次");
        assertEquals(RefundStatus.PENDING.name(), refundStatus(orderId));
    }

    @Test
    void 七天无理由强制_受理阶段只给同意_拒绝落409() {
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.NO_REASON, 2, "不喜欢");

        RefundView enforcing = refunds.buyerDetailView(userId, orderId);
        assertTrue(enforcing.noReasonEnforced());
        assertEquals(
                "NO_REASON",
                jdbc.queryForObject(
                        "SELECT reason_code FROM aftersale.refunds ORDER BY created_at DESC LIMIT 1", String.class));

        // 工作台行与订单行内按钮一起收走「拒绝」
        assertEquals(
                List.of(RefundAvailableAction.AGREE),
                refunds.pageShop(shopId, null, new PageParams(1, 10))
                        .records()
                        .getFirst()
                        .availableActions());
        assertEquals(
                List.of(RefundAvailableAction.AGREE),
                refunds.sellerActionsByOrders(shopId, List.of(orderId))
                        .getFirst()
                        .availableActions());

        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> refunds.reject(shopId, orderId, "拆封影响二次销售"))
                        .getHttpStatus());
        assertEquals(RefundStatus.PENDING.name(), refundStatus(orderId), "违法的拒绝连落点都进不去");

        // 同意 → 回寄 → 已寄回：强制只管「受理」，验货之后的处置回到卖家手里（确认收货 / 确认拦截）
        refunds.agree(shopId, orderId);
        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT998");
        assertEquals(
                List.of(RefundAvailableAction.RECEIVE_RETURN, RefundAvailableAction.INTERCEPT),
                refunds.pageShop(shopId, null, new PageParams(1, 10))
                        .records()
                        .getFirst()
                        .availableActions());
        refunds.intercept(shopId, orderId);
        assertEquals(RefundStatus.CANCELLED.name(), refundStatus(orderId));
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus(orderId), "拦截成功：钱不出");
        assertEquals(3, totalStock(), "货没有回到可售池，不回补");
    }

    @Test
    void 无理由退货超七天窗口_不再强制_卖家可拒绝() {
        jdbc.update(
                "UPDATE orders.orders SET completed_at = now() - interval '8 days' WHERE id = ?::uuid",
                orderId.toString());

        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.NO_REASON, 2, "不喜欢了");

        assertFalse(refunds.buyerDetailView(userId, orderId).noReasonEnforced());
        refunds.reject(shopId, orderId, "无理由退货已过七天期限");
        assertEquals(RefundStatus.REJECTED.name(), refundStatus(orderId));
    }

    @Test
    void 订单快照不支持无理由_不强制_卖家可拒绝() {
        jdbc.update("UPDATE orders.items SET seven_day_return = FALSE WHERE order_id = ?::uuid", orderId.toString());

        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.NO_REASON, 2, "不喜欢了");

        assertFalse(refunds.buyerDetailView(userId, orderId).noReasonEnforced());
        refunds.reject(shopId, orderId, "定制商品，下单页已明示不支持七天无理由退货");
        assertEquals(RefundStatus.REJECTED.name(), refundStatus(orderId));
    }

    @Test
    void 卖家事后关掉商品开关_订单快照仍保留买家的无理由权利() {
        jdbc.update(
                "UPDATE product.products SET seven_day_return = FALSE"
                        + " WHERE id = (SELECT product_id FROM product.skus WHERE id = ?::uuid)",
                skuId.toString());

        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.NO_REASON, 2, null);

        assertTrue(refunds.buyerDetailView(userId, orderId).noReasonEnforced());
    }

    @Test
    void 回寄覆盖更新_重复提交只留一张有效包裹_旧轨迹随旧包裹作废() {
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 2, null);
        refunds.agree(shopId, orderId);

        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        String oldShipmentId =
                jdbc.queryForObject("SELECT id FROM logistics.shipments WHERE tracking_no = 'ZT999'", String.class);
        jdbc.update(
                "INSERT INTO logistics.tracking_nodes (shipment_id, node_code, description, occurred_at, dedupe_key)"
                        + " VALUES (?::uuid, 'ARRIVED_HUB', '到达分拨中心', NOW(), ?)",
                oldShipmentId,
                "it-hub|" + oldShipmentId);

        refunds.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        refunds.returnGoods(userId, orderId, "SF", "顺丰快递", "SF888");

        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.shipments WHERE order_id = ?::uuid AND direction = 'RETURN'",
                        Integer.class,
                        orderId.toString()));
        assertEquals(
                "顺丰速运|SF888",
                jdbc.queryForObject(
                        "SELECT return_carrier_name || '|' || return_tracking_no FROM aftersale.refunds"
                                + " WHERE order_id = ?::uuid",
                        String.class,
                        orderId.toString()));
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.tracking_nodes WHERE shipment_id = ?::uuid",
                        Integer.class,
                        oldShipmentId));
    }

    @Test
    void 工作台列表_带订单摘要_按状态筛选且不串店() {
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 1, "质量不行");

        PageResult<SellerRefundItem> all = refunds.pageShop(shopId, null, new PageParams(1, 10));
        assertEquals(1, all.total());
        SellerRefundItem item = all.records().getFirst();
        assertEquals(orderId, item.orderId());
        assertEquals(RefundType.RETURN_REFUND, item.type());
        assertEquals(RefundStatus.PENDING, item.status());
        assertEquals("质量不行", item.reason());
        assertEquals(1000L, item.amount().amount());
        assertNotNull(item.orderNo());
        assertEquals("张三", item.receiverName());
        assertEquals(1, item.itemCount());
        assertEquals("测试SKU", item.firstItemName());

        assertEquals(
                1, refunds.pageShop(shopId, "PENDING", new PageParams(1, 10)).total());
        assertEquals(
                0, refunds.pageShop(shopId, "REJECTED", new PageParams(1, 10)).total());
        assertEquals(
                0,
                refunds.pageShop(UUID.randomUUID(), null, new PageParams(1, 10)).total());
        assertEquals(
                400,
                assertThrows(
                                BusinessException.class,
                                () -> refunds.pageShop(shopId, "NOT_A_STATUS", new PageParams(1, 10)))
                        .getHttpStatus());
    }

    @Test
    void 按订单批查卖家退款动作_进行中才回_越店与空入参不回() {
        assertEquals(List.of(), refunds.sellerActionsByOrders(shopId, List.of(orderId)));

        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 2, null);
        assertEquals(
                List.of(RefundAvailableAction.AGREE, RefundAvailableAction.REJECT),
                refunds.sellerActionsByOrders(shopId, List.of(orderId))
                        .getFirst()
                        .availableActions());

        refunds.agree(shopId, orderId);
        assertEquals(
                List.of(),
                refunds.sellerActionsByOrders(shopId, List.of(orderId))
                        .getFirst()
                        .availableActions(),
                "待寄回是买家的事，卖家没有动作");
        assertEquals(
                0,
                refunds.sellerActionsByOrders(UUID.randomUUID(), List.of(orderId))
                        .size());
        assertEquals(List.of(), refunds.sellerActionsByOrders(shopId, List.of()));
    }

    @Test
    void 回寄地址_详情查询时实时解析_无默认退货地址为null() {
        apply(orderId, RefundType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, 2, null);
        refunds.agree(shopId, orderId);

        assertNull(refunds.resolveReturnAddress(shopId));

        UUID returnAddressId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.addresses (id, shop_id, contact_name, phone, region_code, province, city, district, detail, default_return) "
                        + "VALUES (?::uuid, ?::uuid, '退件员', '13800001234', '330106', '浙江省', '杭州市', '西湖区', '文一路 100 号', TRUE)",
                returnAddressId.toString(),
                shopId.toString());
        db.onDelete("DELETE FROM shop.addresses WHERE id = ?::uuid", returnAddressId.toString());

        assertEquals(
                "退件员 13800001234 · 浙江省杭州市西湖区文一路 100 号",
                refunds.buyerDetailView(userId, orderId).returnAddress());

        jdbc.update(
                "UPDATE shop.addresses SET contact_name = '新收件人', default_return = FALSE WHERE id = ?::uuid",
                returnAddressId.toString());
        assertNull(refunds.buyerDetailView(userId, orderId).returnAddress());
    }
}
