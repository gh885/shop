package com.shop.platform.order;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockLine;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.PreviewOrderRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.MainProgress;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.CheckoutPreview;
import com.shop.platform.order.service.OrderDetailView;
import com.shop.platform.order.service.OrderPlacementService;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.order.service.TradeListItemView;
import com.shop.platform.order.service.TradeTimeoutService;
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
    private TradeTimeoutService tradeTimeoutService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private StockCommand stockCommand;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    /** shippedOrder() 的运单号自增位：见该方法注释 */
    private int shipmentSeq;

    private UUID addressId;

    /** 建一个在售 SKU：单价 1000 分，库存 5 */
    private void seedSku(int stock) {
        // service 造的数据无法预知主键，按 userId 圈定登记清理（含下单发布的 OrderPlacedEvent 登记行）
        // 下单入口的账号闸门要求真实 ACTIVE 账号（幽灵 uuid 会被 403 USER_DISABLED 拒单）
        db.seedActiveUser(userId);
        db.onDeleteBuyerOrderChain(userId);
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
                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, quantity)), null, null);
    }

    @Test
    void 全链路_下单冻结_支付幂等_已付可取消() {
        seedSku(5);

        // 1. 预览：一组一行，应付 = 1000 × 2
        CheckoutPreview preview = orderService.preview(
                userId, new PreviewOrderRequest(null, List.of(new OrderLineRequest(skuId, 2)), null));
        assertEquals(1, preview.groups().size());
        assertEquals(0, preview.unavailable().size());
        assertEquals(2000L, preview.totalPayAmount().amount());

        // 2. 下单：一张主订单 + 一张子订单，行快照落库、库存 5 → 3（同事务同步调用扣减）
        List<Order> created = orderService.create(userId, buyNow(2)).orders();
        assertEquals(1, created.size());
        Order order = created.getFirst();
        assertEquals(OrderStatus.PAID, order.getStatus()); // 子订单创建即待发货
        assertEquals(2000L, order.getPayAmount());
        assertNotNull(jdbc.queryForObject(
                "SELECT pay_expire_at FROM orders.trades WHERE id = (SELECT trade_id FROM orders.orders WHERE id = ?::uuid)",
                OffsetDateTime.class,
                order.getId().toString()));
        assertEquals(5, totalStockOf());
        assertEquals(2, frozenStockOf());
        assertEquals(3, availableOf());

        // 3. 发起支付：只落 PENDING 流水，订单仍待发货、库存仍冻结（两段式第一段不动订单、不扣实）
        Payment pending = paymentService.pay(userId, order.getId());
        assertEquals(PaymentStatus.PENDING, pending.getStatus());
        assertEquals(OrderStatus.PAID, statusOf(order.getId()));
        assertNull(
                jdbc.queryForObject(
                        "SELECT paid_at FROM orders.orders WHERE id = ?::uuid",
                        OffsetDateTime.class,
                        order.getId().toString()),
                "发起支付不写 paid_at");
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

        List<Order> first = orderPlacementService.place(userId, req).orders();
        List<Order> again = orderPlacementService.place(userId, req).orders();

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

        List<Order> created = orderService.create(userId, buyNow(1)).orders();
        UUID orderId = created.getFirst().getId();
        assertEquals(4, availableOf());
        assertEquals(1, frozenStockOf());

        // 把付款截止时刻拨到过去，模拟超时（截止在主订单上）
        jdbc.update(
                "UPDATE orders.trades SET pay_expire_at = ? WHERE id = (SELECT trade_id FROM orders.orders WHERE id = ?::uuid)",
                Timestamp.from(OffsetDateTime.now().minusSeconds(1).toInstant()),
                orderId.toString());

        int closed = tradeTimeoutService.sweep();
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
        UUID orderId =
                orderService.create(userId, buyNow(2)).orders().getFirst().getId();
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
        UUID orderId =
                orderService.create(userId, buyNow(1)).orders().getFirst().getId();

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

    /** 买家列表以<b>主订单</b>为卡片：一次结算一行，店铺段与行项都嵌在里面（列表页零二次请求） */
    @Test
    void 我的订单分页_一张主订单一张卡_带店铺段与行项() {
        seedSku(5);
        orderService.create(userId, buyNow(1));

        PageResult<TradeListItemView> page = orderService.pageMyTrades(userId, null, new PageParams(1, 10));
        assertEquals(1, page.total());
        TradeListItemView card = page.records().getFirst();
        assertEquals(MainProgress.PENDING_PAYMENT, card.mainProgress(), "未支付的主进度是待付款（§5.3 规则 0）");
        assertEquals(1, card.orders().size());
        assertEquals(1, card.orders().getFirst().items().size());
        // 店名由 service 经 shop :: api 批查补入（不跨 schema JOIN，也不由入口去别的模块取数）
        assertEquals("测试店-" + shopId, card.orders().getFirst().shopName());
    }

    /**
     * 主进度投影（§5.3）：待付款 → 待发货 → 部分发货 → 待收货 → 已完成，全取消收成已关闭。
     *
     * <p>断言读的是 {@code orders.trade_progress} 视图（真库），不是 service 里另算一遍：
     * 列表筛选与详情展示共用那一份 CASE，这里缺一条就说明买家看到的页签会串档。
     */
    @Test
    void 主进度投影_随履约事实推进_全取消收成已关闭() {
        seedSku(5);
        UUID orderId =
                orderService.create(userId, buyNow(2)).orders().getFirst().getId();
        UUID tradeId = tradeIdOf(orderId);
        assertEquals(MainProgress.PENDING_PAYMENT, progressOf(tradeId), "未支付");

        paymentService.confirm(userId, paymentService.pay(userId, orderId).getId());
        assertEquals(MainProgress.PENDING_SHIPMENT, progressOf(tradeId), "付清没发 = 待发货");

        // 发一半：有行结清、仍有行未结清
        shipmentService.dispatch(
                shopId,
                shipmentService.record(new DispatchShipmentCommand(
                        shopId, orderId, "SF", String.format("SF%09d", ++shipmentSeq), shipLines(orderId, 1))));
        assertEquals(MainProgress.PARTIALLY_SHIPPED, progressOf(tradeId), "发一半 = 部分发货");

        // 发完等签收
        shipmentService.dispatch(
                shopId,
                shipmentService.record(new DispatchShipmentCommand(
                        shopId, orderId, "SF", String.format("SF%09d", ++shipmentSeq), shipLines(orderId, 1))));
        assertEquals(MainProgress.PENDING_RECEIPT, progressOf(tradeId), "全结清未签收 = 待收货");

        orderTransitionService.receive(userId, orderId);
        assertEquals(MainProgress.COMPLETED, progressOf(tradeId), "全部完成 = 已完成");

        // 全取消收成已关闭（规则 2：活跃子订单为空）
        UUID cancelledOrderId =
                orderService.create(userId, buyNow(1)).orders().getFirst().getId();
        orderTransitionService.cancel(userId, cancelledOrderId, "不想买了");
        assertEquals(MainProgress.CLOSED, progressOf(tradeIdOf(cancelledOrderId)));

        // 页签筛选读同一份投影：已完成档只出那一张
        PageResult<TradeListItemView> completed =
                orderService.pageMyTrades(userId, MainProgress.COMPLETED.name(), new PageParams(1, 10));
        assertEquals(1, completed.total());
        assertEquals(MainProgress.COMPLETED, completed.records().getFirst().mainProgress());
    }

    /**
     * 多店拆单的主进度：一单已完成、一单还没发货时是「部分发货」，不是「待收货」——规则 4 优先于 5（§5.3）。
     * 另验证已取消的子订单退出判断：只剩一单时主进度只看这一单。
     */
    @Test
    void 主进度投影_多店拆单_未结清优先于已结清() {
        seedSku(5);
        UUID otherShopId = UUID.randomUUID();
        UUID otherSkuId = db.seedOnSaleSku(otherShopId, 1200, 5);
        db.seedShipAddress(otherShopId);

        List<Order> orders = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(),
                                addressId,
                                List.of(new OrderLineRequest(skuId, 1), new OrderLineRequest(otherSkuId, 1)),
                                null,
                                null))
                .orders();
        assertEquals(2, orders.size(), "两家店拆出两张子订单");
        UUID tradeId = tradeIdOf(orders.getFirst().getId());
        assertEquals(tradeId, tradeIdOf(orders.get(1).getId()));

        // 整笔付清：待发货
        paymentService.confirmTrade(
                userId, paymentService.payTrade(userId, tradeId).tradeId());
        assertEquals(MainProgress.PENDING_SHIPMENT, progressOf(tradeId));

        // 只把第一家店的单做完：另一单一行没结清 ⇒ 主进度停在部分发货
        UUID firstOrderId = orders.getFirst().getId();
        shipmentService.dispatch(
                shopId,
                shipmentService.record(new DispatchShipmentCommand(
                        shopId,
                        firstOrderId,
                        "SF",
                        String.format("SF%09d", ++shipmentSeq),
                        shipLines(firstOrderId, 1))));
        orderTransitionService.receive(userId, firstOrderId);
        assertEquals(OrderStatus.COMPLETED, statusOf(firstOrderId));
        assertEquals(MainProgress.PARTIALLY_SHIPPED, progressOf(tradeId));

        // 第二家店那单取消：它退出判断，主进度只剩已完成的那一单
        orderTransitionService.cancel(userId, orders.get(1).getId(), "不想要了");
        assertEquals(MainProgress.COMPLETED, progressOf(tradeId));
    }

    /** 买家详情装配（真库）：店名同口径补入；本人号码不脱敏——脱敏只落在卖家视角（ORD-62） */
    @Test
    void 买家详情_带店名且本人电话不脱敏() {
        seedSku(5);
        UUID orderId =
                orderService.create(userId, buyNow(1)).orders().getFirst().getId();

        OrderDetailView detail = orderService.detail(userId, orderId);

        assertEquals("测试店-" + shopId, detail.shopName());
        assertEquals("13800000000", detail.receiverPhone());
    }

    /**
     * 发货收货腿：录单 → 交寄 → 部分发货 → 已发货 → 完成。
     * 发货动作已归 logistics，这里盯的是<b>订单侧后果</b>：越店 404、未付款 409、交寄才入账、
     * 物流摘要取最新包裹、shipped_at 与收货窗口只回填一次、超发 409、取消已发出包裹回退账本。
     */
    @Test
    void 发货收货_订单侧推进与投影_越店404错态409() {
        seedSku(5);
        UUID orderId =
                orderService.create(userId, buyNow(2)).orders().getFirst().getId();
        Payment pending = paymentService.pay(userId, orderId);
        paymentService.confirm(userId, pending.getId()); // 两段式：确认后才推进到 PAID

        // 1. 越店录单：另一家店的 shopId 圈不到这单 → 404，订单状态不动
        assertEquals(
                404,
                assertThrows(
                                BusinessException.class,
                                () -> shipmentService.record(new DispatchShipmentCommand(
                                        UUID.randomUUID(), orderId, "SF", "SF123456789", shipLines(orderId, 1))))
                        .getHttpStatus());
        assertEquals(OrderStatus.PAID, statusOf(orderId));

        // 2. 本店录单只占行、不发货：包裹落成待发货，订单与行账本都没动
        UUID firstShipment = shipmentService.record(
                new DispatchShipmentCommand(shopId, orderId, "SF", "SF123456789", shipLines(orderId, 1)));
        assertEquals(OrderStatus.PAID, statusOf(orderId));
        assertEquals(0, shippedQuantityOf(orderId), "待发货不占有效发货量");
        assertEquals(ShipmentStatus.PENDING_DISPATCH, shipmentStatusOf(firstShipment));

        // 3. 交寄一半：PAID → 部分发货，物流摘要回填，行账本 +1
        shipmentService.dispatch(shopId, firstShipment);
        assertEquals(OrderStatus.PARTIALLY_SHIPPED, statusOf(orderId));
        assertEquals(1, shippedQuantityOf(orderId));
        assertEquals("顺丰速运|SF123456789", summaryOf(orderId));
        OffsetDateTime firstShippedAt = shippedAtOf(orderId);
        OffsetDateTime firstReceiveExpireAt = receiveExpireAt(orderId);

        // 4. 追加包裹发完剩下的 1 件：部分发货 → 已发货；摘要取最新包裹，发货时刻与收货窗口不后推
        UUID secondShipment = shipmentService.record(
                new DispatchShipmentCommand(shopId, orderId, "ZTO", "ZTO987654321", shipLines(orderId, 1)));
        shipmentService.dispatch(shopId, secondShipment);
        assertEquals(OrderStatus.SHIPPED, statusOf(orderId));
        assertEquals(2, shippedQuantityOf(orderId));
        assertEquals("中通快递|ZTO987654321", summaryOf(orderId), "订单摘要投影取最新包裹");
        assertEquals(firstShippedAt.toInstant(), shippedAtOf(orderId).toInstant(), "后续包裹不得把发货时刻往后推");
        assertEquals(firstReceiveExpireAt.toInstant(), receiveExpireAt(orderId).toInstant(), "后续包裹不得把收货窗口往后推");

        // 5. 超发：整行已结清，再录一张发货单在守卫处就 409（不多落一张包裹）
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> shipmentService.record(new DispatchShipmentCommand(
                                        shopId, orderId, "YD", "YD000000001", shipLines(orderId, 1))))
                        .getHttpStatus());
        assertEquals(2, shipmentCountOf(orderId));

        // 6. 取消已发出的包裹：有效发货量回退，订单退回部分发货
        shipmentService.cancel(shopId, secondShipment);
        assertEquals(OrderStatus.PARTIALLY_SHIPPED, statusOf(orderId));
        assertEquals(1, shippedQuantityOf(orderId));

        // 7. 退回来的量可以再发：重新发一张就回到已发货
        shipmentService.dispatch(
                shopId,
                shipmentService.record(
                        new DispatchShipmentCommand(shopId, orderId, "YD", "YD000000002", shipLines(orderId, 1))));
        assertEquals(OrderStatus.SHIPPED, statusOf(orderId));

        // 8. 已取消的单不可录单：409 且不落包裹
        UUID cancelledOrderId =
                orderService.create(userId, buyNow(1)).orders().getFirst().getId();
        orderTransitionService.cancel(userId, cancelledOrderId, "不想买了");
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> shipmentService.record(new DispatchShipmentCommand(
                                        shopId, cancelledOrderId, "SF", "SF000000001", shipLines(cancelledOrderId, 1))))
                        .getHttpStatus());

        // 9. 收货：已发货 → 已完成，完成时刻落库；重复收货被状态闸门拒绝
        orderTransitionService.receive(userId, orderId);
        assertEquals(OrderStatus.COMPLETED, statusOf(orderId));
        assertNotNull(jdbc.queryForObject(
                "SELECT completed_at FROM orders.orders WHERE id = ?::uuid", Object.class, orderId.toString()));
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> orderTransitionService.receive(userId, orderId))
                        .getHttpStatus());
    }

    /** 包裹状态（真库读）：录单/交寄/取消的断言都读库，不看 service 返回值 */
    private ShipmentStatus shipmentStatusOf(UUID shipmentId) {
        return jdbc.queryForObject(
                "SELECT status FROM logistics.shipments WHERE id = ?::uuid",
                ShipmentStatus.class,
                shipmentId.toString());
    }

    /** 子订单的主订单 id（主进度、关单级联都按它定位） */
    private UUID tradeIdOf(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT trade_id FROM orders.orders WHERE id = ?::uuid", UUID.class, orderId.toString());
    }

    /** 主进度（真库读视图）：断言走 §5.3 的唯一实现，不在测试里复述规则 */
    private MainProgress progressOf(UUID tradeId) {
        return jdbc.queryForObject(
                "SELECT main_progress FROM orders.trade_progress WHERE trade_id = ?::uuid",
                MainProgress.class,
                tradeId.toString());
    }

    /** 该单有效发货量合计：行账本累加是否正确只看这个数 */
    private int shippedQuantityOf(UUID orderId) {
        Integer sum = jdbc.queryForObject(
                "SELECT COALESCE(sum(shipped_quantity), 0) FROM orders.items WHERE order_id = ?::uuid",
                Integer.class,
                orderId.toString());
        return sum == null ? 0 : sum;
    }

    private int shipmentCountOf(UUID orderId) {
        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM logistics.shipments WHERE order_id = ?::uuid", Integer.class, orderId.toString());
        return count == null ? 0 : count;
    }

    /** 订单上的物流摘要投影（公司 + 单号） */
    private String summaryOf(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT logistics_company || '|' || tracking_no FROM orders.orders WHERE id = ?::uuid",
                String.class,
                orderId.toString());
    }

    private OffsetDateTime shippedAtOf(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT shipped_at FROM orders.orders WHERE id = ?::uuid", OffsetDateTime.class, orderId.toString());
    }

    /** 把该单的行按「发几件」装进一个包裹：测试只关心发了多少，不关心装的是哪一行 */
    private List<DispatchShipmentCommand.Line> shipLines(UUID orderId, int quantity) {
        UUID itemId = jdbc.queryForObject(
                "SELECT id FROM orders.items WHERE order_id = ?::uuid ORDER BY created_at, id LIMIT 1",
                UUID.class,
                orderId.toString());
        return List.of(new DispatchShipmentCommand.Line(itemId, quantity));
    }

    /** 造一单走完「下单 → 付款 → 发货」，返回订单 id：延长收货的前置态 */
    private UUID shippedOrder() {
        UUID orderId =
                orderService.create(userId, buyNow(1)).orders().getFirst().getId();
        paymentService.confirm(userId, paymentService.pay(userId, orderId).getId());
        // 运单号全局唯一（LOG）：一个测试里发多单必须各给一个号，否则第二单被「已录入」挡下
        UUID shipmentId = shipmentService.record(new DispatchShipmentCommand(
                shopId, orderId, "SF", String.format("SF%09d", ++shipmentSeq), shipLines(orderId, 1)));
        shipmentService.dispatch(shopId, shipmentId);
        return orderId;
    }

    private OffsetDateTime receiveExpireAt(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT receive_expire_at FROM orders.orders WHERE id = ?::uuid",
                OffsetDateTime.class,
                orderId.toString());
    }

    private int receiveExtendedCount(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT receive_extended_count FROM orders.orders WHERE id = ?::uuid",
                Integer.class,
                orderId.toString());
    }

    private int statusLogRows(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM orders.order_status_log WHERE order_id = ?::uuid",
                Integer.class,
                orderId.toString());
    }

    /**
     * 延长收货（ORD-63，真库）：+7 天从**当前截止**起算、额度 1 次、不写状态流水。
     *
     * <p>这条只能由真库验：额度靠 {@code setSql} 自增、四条闸门靠同一条 WHERE 裁决（0 行即 409），
     * 单测里 mock 掉 mapper 就只剩「有没有调对参数」。四道闸门各挡一次：非 SHIPPED / 已签收 / 额度用尽 / 截止已过，
     * 外加越权 404。详情里的 {@code canExtendReceive} 与 WHERE 同源，顺带钉住它不给按钮的时刻后端也不放行。
     */
    @Test
    void 延长收货_从当前截止加七天_四道闸门与越权各自拦住() {
        seedSku(10);

        // 1. 已发货未签收：可延长，且延长是「当前截止 +7」而不是「点击时刻 +7」
        UUID orderId = shippedOrder();
        OffsetDateTime deadline = receiveExpireAt(orderId);
        assertTrue(orderService.detail(userId, orderId).canExtendReceive());
        int logsBefore = statusLogRows(orderId);

        orderTransitionService.extendReceive(userId, orderId);

        assertEquals(deadline.plusDays(7).toInstant(), receiveExpireAt(orderId).toInstant(), "从当前截止往后推：已过去的天数不能被吞掉");
        assertEquals(1, receiveExtendedCount(orderId));
        assertEquals(OrderStatus.SHIPPED, statusOf(orderId), "延长不是状态转移");
        assertEquals(logsBefore, statusLogRows(orderId), "状态没变，不该落 order_status_log");

        // 2. 额度只有 1 次：第二次被拒，截止时刻不再后推
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> orderTransitionService.extendReceive(userId, orderId))
                        .getHttpStatus());
        assertEquals(deadline.plusDays(7).toInstant(), receiveExpireAt(orderId).toInstant(), "额度用尽后拒绝，不得再推截止");
        assertFalse(orderService.detail(userId, orderId).canExtendReceive(), "额度用尽则按钮撤下");

        // 3. 未发货（PAID）不可延长：收货窗口还没铺出来，无「截止」可延
        UUID paidOrderId =
                orderService.create(userId, buyNow(1)).orders().getFirst().getId();
        paymentService.confirm(userId, paymentService.pay(userId, paidOrderId).getId());
        assertFalse(orderService.detail(userId, paidOrderId).canExtendReceive(), "未发货则按钮不出现");
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> orderTransitionService.extendReceive(userId, paidOrderId))
                        .getHttpStatus());

        // 4. 已签收不可延长：签收起算的窗口由 ORD-28 定，买家单方面的延长不认
        UUID deliveredOrderId = shippedOrder();
        jdbc.update("UPDATE orders.orders SET delivered_at = NOW() WHERE id = ?::uuid", deliveredOrderId.toString());
        assertFalse(orderService.detail(userId, deliveredOrderId).canExtendReceive(), "已签收则按钮撤下");
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> orderTransitionService.extendReceive(userId, deliveredOrderId))
                        .getHttpStatus());

        // 5. 截止已过不可延长：这单注定要被超时任务收走，延长等于救回一个已终结的窗口
        UUID expiredOrderId = shippedOrder();
        jdbc.update(
                "UPDATE orders.orders SET receive_expire_at = NOW() - interval '1 day' WHERE id = ?::uuid",
                expiredOrderId.toString());
        OffsetDateTime expiredAt = receiveExpireAt(expiredOrderId);
        assertFalse(orderService.detail(userId, expiredOrderId).canExtendReceive(), "已过截止则按钮撤下");
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> orderTransitionService.extendReceive(userId, expiredOrderId))
                        .getHttpStatus());
        assertEquals(expiredAt.toInstant(), receiveExpireAt(expiredOrderId).toInstant(), "WHERE 未过则一个字节都不写");

        // 6. 别人的单：与「不存在」同一句话 404（不泄露单是否存在）
        UUID foreignOrder = shippedOrder();
        assertEquals(
                404,
                assertThrows(
                                BusinessException.class,
                                () -> orderTransitionService.extendReceive(UUID.randomUUID(), foreignOrder))
                        .getHttpStatus());
    }
}
