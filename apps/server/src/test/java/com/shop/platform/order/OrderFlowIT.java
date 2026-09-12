package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderPlacementService;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTimeout;
import com.shop.platform.order.service.OrderTimeoutService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.order.service.OrderWithItems;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 交易关键链路集成验证（真库）：预览 → 下单扣库存 → MOCK 支付推进状态机 → 幂等重付 →
 * 已付款取消回补库存且落退款单据 → 越态取消拒绝 → 超时关单回补库存。测试数据自建自清，不依赖种子数据。
 *
 * <p>库存闸门在<b>真并发</b>下的可靠性单独由 inventory/StockConcurrencyIT 验证（本类的
 * 「并发窗口_库存抢空」是单线程造场景，只说闸门未过时的响应，不说并发安全）。
 */
@SpringBootTest
class OrderFlowIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderPlacementService orderPlacementService;

    @Autowired
    private OrderTransitionService orderTransitionService;

    /** 发货已归一为物流动作：状态机后半段由 logistics 经 order :: api 推进 */
    @Autowired
    private ShipmentService shipmentService;

    @Autowired
    private OrderTimeoutService orderTimeoutService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private StockCommand stockCommand;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    /** 建一个在售 SKU：单价 1000 分，库存 5 */
    private void seedSku(int stock) {
        // service 造的数据无法预知主键，按 userId 圈定登记清理（含下单发布的 OrderPlacedEvent 登记行）
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        // 发货会落 logistics 包裹（同事务）：测试自建自清，不登记会在重跑时撞运单号唯一索引
        db.onDelete("DELETE FROM logistics.shipments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM logistics.tracking_nodes WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
        skuId = db.seedOnSaleSku(shopId, 1000, stock);
        addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);
    }

    private int totalStockOf() {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private int frozenStockOf() {
        return jdbc.queryForObject(
                "SELECT frozen_stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private int availableOf() {
        return totalStockOf() - frozenStockOf();
    }

    private OrderStatus statusOf(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT status FROM orders.orders WHERE id = ?::uuid", OrderStatus.class, orderId.toString());
    }

    private CreateOrderRequest buyNow(int quantity) {
        return new CreateOrderRequest(
                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, quantity)), null);
    }

    @Test
    void 全链路_下单冻结_支付幂等_已付可取消() {
        seedSku(5);

        // 1. 预览：一组一行，应付 = 1000 × 2
        CheckoutPreview preview =
                orderService.preview(userId, new PreviewOrderRequest(null, List.of(new OrderLineRequest(skuId, 2))));
        assertEquals(1, preview.groups().size());
        assertEquals(0, preview.unavailable().size());
        assertEquals(2000L, preview.totalPayAmount().amount());

        // 2. 下单：拆一单、行快照落库、库存 5 → 3（同事务同步调用扣减）
        List<Order> created = orderService.create(userId, buyNow(2));
        assertEquals(1, created.size());
        Order order = created.getFirst();
        assertEquals(OrderStatus.PENDING_PAYMENT, order.getStatus());
        assertEquals(2000L, order.getPayAmount());
        assertNotNull(order.getPayExpireAt());
        assertEquals(5, totalStockOf());
        assertEquals(2, frozenStockOf());
        assertEquals(3, availableOf());

        // 3. 发起支付：只落 PENDING 流水，订单仍待付款、库存仍冻结（两段式第一段不动订单、不扣实）
        Payment pending = paymentService.pay(userId, order.getId());
        assertEquals(PaymentStatus.PENDING, pending.getStatus());
        assertEquals(OrderStatus.PENDING_PAYMENT, statusOf(order.getId()));
        assertEquals(5, totalStockOf());
        assertEquals(2, frozenStockOf());

        // 3b. 确认支付：PENDING → SUCCESS + 订单推进到 PAID（同事务同步调用链扣实冻结库存）
        Payment paid = paymentService.confirm(userId, pending.getId());
        assertEquals(PaymentStatus.SUCCESS, paid.getStatus());
        assertEquals(OrderStatus.PAID, statusOf(order.getId()));
        assertEquals(3, totalStockOf());
        assertEquals(0, frozenStockOf());

        // 4. 幂等重付：发起返回同一笔成功流水（确认后已成 SUCCESS），订单状态不变
        Payment again = paymentService.pay(userId, order.getId());
        assertEquals(paid.getId(), again.getId());
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM payment.payments WHERE order_id = ?::uuid",
                        Integer.class,
                        order.getId().toString()));

        // 5. 已付款（待发货）仍可取消：已扣实 → 回补总库存（3→5）；重复取消被状态闸门拒绝
        orderTransitionService.cancel(userId, order.getId(), "不想买了");
        assertEquals(OrderStatus.CANCELLED, statusOf(order.getId()));
        assertEquals(5, totalStockOf());
        assertEquals(0, frozenStockOf());

        // 5b. 已付款单取消必须留下退款单据：成功流水转 REFUNDED 并回填退款时刻（同事务，绝不出现「单已取消、货款仍显示已收」）
        assertEquals(
                PaymentStatus.REFUNDED.name(),
                jdbc.queryForObject(
                        "SELECT status FROM payment.payments WHERE id = ?::uuid",
                        String.class,
                        paid.getId().toString()));
        assertNotNull(jdbc.queryForObject(
                "SELECT refunded_at FROM payment.payments WHERE id = ?::uuid",
                Timestamp.class,
                paid.getId().toString()));

        // 回补记账走 RETURN（RELEASE 口径 quantity=0，回补动总库存必须独立类型，否则按 type 对账失真）
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM inventory.stock_movements WHERE order_id = ?::uuid AND type = 'RETURN'",
                        Integer.class,
                        order.getId().toString()));

        BusinessException ex = assertThrows(
                BusinessException.class, () -> orderTransitionService.cancel(userId, order.getId(), "再试一次"));
        assertEquals(409, ex.getHttpStatus());
    }

    /** 幂等：同一 checkoutKey 重复提交（双击 / 超时重试）撞唯一键后回放原单，库存只冻结一次 */
    @Test
    void 重复提交同一checkoutKey_回放原单_不重复冻结() {
        seedSku(5);
        CreateOrderRequest req = buyNow(2);

        List<Order> first = orderPlacementService.place(userId, req);
        List<Order> again = orderPlacementService.place(userId, req);

        assertEquals(first.getFirst().getId(), again.getFirst().getId());
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM orders.orders WHERE user_id = ?::uuid",
                        Integer.class,
                        userId.toString()));
        assertEquals(2, frozenStockOf());
    }

    /** 请求行库存不足在 resolve 前置拦截（400），与预览同一道判定；订单零残留 */
    @Test
    void 创建订单_库存不足_前置拦截零残留() {
        seedSku(5);

        BusinessException ex = assertThrows(BusinessException.class, () -> orderService.create(userId, buyNow(999)));
        assertEquals(400, ex.getHttpStatus());

        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM orders.orders WHERE user_id = ?::uuid",
                        Integer.class,
                        userId.toString()));
        assertEquals(5, totalStockOf());
        assertEquals(0, frozenStockOf());
    }

    /** 并发窗口兑底：预览时充足、冻结时被抢空 → 条件更新影响行数 0 → StockCommand 抛 INSUFFICIENT_STOCK(409) */
    @Test
    void 并发窗口_库存抢空_409() {
        seedSku(5);

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> stockCommand.freeze(UUID.randomUUID(), List.of(new StockLine(skuId, 999))));
        assertEquals(409, ex.getHttpStatus());
        assertEquals("INSUFFICIENT_STOCK", ex.getCode());
    }

    @Test
    void 超时关单_回补库存_转已取消() throws Exception {
        seedSku(5);

        List<Order> created = orderService.create(userId, buyNow(1));
        UUID orderId = created.getFirst().getId();
        assertEquals(4, availableOf());
        assertEquals(1, frozenStockOf());

        // 把付款截止时刻拨到过去，模拟超时
        jdbc.update(
                "UPDATE orders.orders SET pay_expire_at = ? WHERE id = ?::uuid",
                Timestamp.from(OffsetDateTime.now().minusSeconds(1).toInstant()),
                orderId.toString());

        int closed = orderTimeoutService.sweep(OrderTimeout.PAY);
        assertTrue(closed >= 1);
        assertEquals(OrderStatus.CANCELLED, statusOf(orderId));
        assertEquals(5, availableOf()); // 库存已回补（释放冻结）
        assertEquals(0, frozenStockOf());

        // 关单后再支付被拒：订单不是待付款状态
        BusinessException ex = assertThrows(BusinessException.class, () -> paymentService.pay(userId, orderId));
        assertEquals(409, ex.getHttpStatus());
    }

    /** 库存绝对量调整的业务闸门：新总量低于在冻量拒绝（409），冻结释放后放行 */
    @Test
    void 调整总量_低于在冻_拒绝至释放() {
        seedSku(5);
        UUID orderId = orderService.create(userId, buyNow(2)).getFirst().getId();
        assertEquals(2, frozenStockOf());

        BusinessException ex = assertThrows(BusinessException.class, () -> stockCommand.setTotal(skuId, 1));
        assertEquals(409, ex.getHttpStatus());
        assertEquals(5, totalStockOf()); // 拒绝即整体不生效，不产生半套状态

        // 取消释放冻结后允许调低
        orderTransitionService.cancel(userId, orderId, null);
        stockCommand.setTotal(skuId, 1);
        assertEquals(1, totalStockOf());
    }

    /** 库存主体行随 SKU 删除：有冻结在身拒绝删（否则取消时 release 无处可释放），释放后可清；流水保留 */
    @Test
    void 删库存行_冻结中拒绝_释放后清除() {
        seedSku(5);
        UUID orderId = orderService.create(userId, buyNow(1)).getFirst().getId();

        BusinessException ex = assertThrows(BusinessException.class, () -> stockCommand.removeRow(skuId));
        assertEquals(409, ex.getHttpStatus());
        assertEquals(1, frozenStockOf());

        orderTransitionService.cancel(userId, orderId, null);
        stockCommand.removeRow(skuId);
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM inventory.sku_stock WHERE sku_id = ?::uuid",
                        Integer.class,
                        skuId.toString()));
        // append-only 账本不随行清理（FREEZE + RELEASE 两笔历史）
        assertEquals(
                2,
                jdbc.queryForObject(
                        "SELECT count(*) FROM inventory.stock_movements WHERE sku_id = ?::uuid",
                        Integer.class,
                        skuId.toString()));
    }

    @Test
    void 分页我的订单_带商品明细() {
        seedSku(5);
        orderService.create(userId, buyNow(1));

        PageResult<OrderWithItems> page = orderService.pageMine(userId, null, new PageParams(1, 10));
        assertEquals(1, page.total());
        assertEquals(1, page.records().getFirst().items().size());
    }

    /**
     * 发货收货腿：状态机后半段 PAID → SHIPPED → COMPLETED 只有真库能验条件更新影响行数。
     * 发货动作本身已归 logistics（见 LogisticsIT），这里盯的是<b>订单侧后果</b>：
     * 越店不发、已取消不发、物流摘要投影回填、_shipped_at 与收货窗口只回填一次、重复收货 409。
     */
    @Test
    void 发货收货_订单侧推进与投影_越店404错态409() {
        seedSku(5);
        UUID orderId = orderService.create(userId, buyNow(2)).getFirst().getId();
        Payment pending = paymentService.pay(userId, orderId);
        paymentService.confirm(userId, pending.getId()); // 两段式：确认后才推进到 PAID

        // 越店发货：另一家店的 shopId 圈不到这单 → 404，订单状态不动
        assertEquals(
                404,
                assertThrows(
                                BusinessException.class,
                                () -> shipmentService.dispatch(
                                        new DispatchShipmentCommand(UUID.randomUUID(), orderId, "SF", "SF123456789")))
                        .getHttpStatus());
        assertEquals(OrderStatus.PAID, statusOf(orderId));

        // 本店发货：PAID → SHIPPED，物流公司（字典名）与运单号回填成订单上的摘要投影
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, orderId, "SF", "SF123456789"));
        assertEquals(OrderStatus.SHIPPED, statusOf(orderId));
        String logistics = jdbc.queryForObject(
                "SELECT logistics_company || '|' || tracking_no FROM orders.orders WHERE id = ?::uuid",
                String.class,
                orderId.toString());
        assertEquals("顺丰速运|SF123456789", logistics);

        // 已发货仍可再发（一单多包裹），但订单的发货时刻与收货窗口只回填一次
        OffsetDateTime firstShippedAt = jdbc.queryForObject(
                "SELECT shipped_at FROM orders.orders WHERE id = ?::uuid", OffsetDateTime.class, orderId.toString());
        OffsetDateTime firstReceiveExpireAt = jdbc.queryForObject(
                "SELECT receive_expire_at FROM orders.orders WHERE id = ?::uuid",
                OffsetDateTime.class,
                orderId.toString());
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, orderId, "ZTO", "ZTO987654321"));
        assertEquals(OrderStatus.SHIPPED, statusOf(orderId));
        assertEquals(
                firstShippedAt.toInstant(),
                jdbc.queryForObject(
                                "SELECT shipped_at FROM orders.orders WHERE id = ?::uuid",
                                OffsetDateTime.class,
                                orderId.toString())
                        .toInstant(),
                "追加包裹不得把订单的发货时刻往后推");
        assertEquals(
                firstReceiveExpireAt.toInstant(),
                jdbc.queryForObject(
                                "SELECT receive_expire_at FROM orders.orders WHERE id = ?::uuid",
                                OffsetDateTime.class,
                                orderId.toString())
                        .toInstant(),
                "追加包裹不得把收货窗口往后推");
        assertEquals(
                "中通快递|ZTO987654321",
                jdbc.queryForObject(
                        "SELECT logistics_company || '|' || tracking_no FROM orders.orders WHERE id = ?::uuid",
                        String.class,
                        orderId.toString()),
                "订单摘要投影取最新包裹");

        // 已取消/已完成的单不可发货：取消后发货被拒，且不落包裹
        UUID cancelledOrderId =
                orderService.create(userId, buyNow(1)).getFirst().getId();
        orderTransitionService.cancel(userId, cancelledOrderId, "不想买了");
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> shipmentService.dispatch(
                                        new DispatchShipmentCommand(shopId, cancelledOrderId, "SF", "SF000000001")))
                        .getHttpStatus());

        // 收货：SHIPPED → COMPLETED，完成时刻落库；重复收货被状态闸门拒绝
        orderTransitionService.receive(userId, orderId);
        assertEquals(OrderStatus.COMPLETED, statusOf(orderId));
        assertNotNull(jdbc.queryForObject(
                "SELECT completed_at FROM orders.orders WHERE id = ?::uuid", Object.class, orderId.toString()));
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> orderTransitionService.receive(userId, orderId))
                        .getHttpStatus());
    }
}
