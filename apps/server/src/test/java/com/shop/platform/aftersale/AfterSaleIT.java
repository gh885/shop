package com.shop.platform.aftersale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.aftersale.service.AfterSaleService;
import com.shop.platform.aftersale.service.SellerTicketItem;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
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
 * 售后集成验证（真库）：申请 → 卖家同意进入退货流程（未退款）→ 买家回寄填物流（态不变）→ 卖家确认收货 →
 * 退款落账 + 库存回补；以及仅退款一步到位。全程走 PaymentGateway（Mock）真实链路，并钉死
 * 「售后单本体在 aftersale.tickets、订单只留投影」这条跨模块一致性——mock 掉 order / payment 时整条链路是假的。
 */
@SpringBootTest
class AfterSaleIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private OrderTransitionService transitions;

    /** 发货已归一为物流动作（order 侧只剩状态机后半段） */
    @Autowired
    private ShipmentService shipmentService;

    @Autowired
    private AfterSaleService afterSale;

    /** 自动确认收货那条超时线：待收货售后与它的先后关系由本类钉住 */
    @Autowired
    private OrderTimeoutService timeouts;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID orderId;

    private UUID addressId;

    @BeforeEach
    void seed() {
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        // 发货与回寄都会落 logistics 包裹（同事务）：测试自建自清，不登记会在重跑时撞运单号唯一索引
        db.onDelete("DELETE FROM logistics.shipments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM logistics.tracking_nodes WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete(
                "DELETE FROM aftersale.ticket_events WHERE ticket_id IN (SELECT id FROM aftersale.tickets WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM aftersale.tickets WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
        db.onDelete("DELETE FROM account.users WHERE id = ?::uuid", userId.toString());
        // 下单入口的账号闸门要求真实 ACTIVE 账号（幽灵 uuid 会被 403 USER_DISABLED 拒单）
        seedActiveUser();
        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);

        // 走到履约闭环（COMPLETED）：下单冻结 → 支付扣实 → 发货 → 确认收货
        Order created = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 2)), null, null))
                .getFirst();
        orderId = created.getId();
        Payment pending = paymentService.pay(userId, orderId);
        paymentService.confirm(userId, pending.getId());
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, orderId, "SF", "SF111"));
        transitions.receive(userId, orderId);
        assertEquals(3, totalStock());
    }

    /** 造一个真实 ACTIVE 买家账号：手机号按 uuid 派生避免并发跑撞唯一索引（与 coupon 测试同一写法） */
    private void seedActiveUser() {
        jdbc.update(
                "INSERT INTO account.users (id, phone, status) VALUES (?::uuid, ?, 'ACTIVE')",
                userId.toString(),
                "139" + Math.abs(userId.getMostSignificantBits() % 100_000_000L));
    }

    private int totalStock() {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    private String ticketStatus() {
        return jdbc.queryForObject(
                "SELECT status FROM aftersale.tickets WHERE order_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
                String.class,
                orderId.toString());
    }

    private String orderProjection() {
        return jdbc.queryForObject(
                "SELECT after_sale_status FROM orders.orders WHERE id = ?::uuid", String.class, orderId.toString());
    }

    private String paymentStatus() {
        return jdbc.queryForObject(
                "SELECT status FROM payment.payments WHERE order_id = ?::uuid", String.class, orderId.toString());
    }

    private String orderStatus(UUID id) {
        return jdbc.queryForObject("SELECT status FROM orders.orders WHERE id = ?::uuid", String.class, id.toString());
    }

    private String ticketStatus(UUID id) {
        return jdbc.queryForObject(
                "SELECT status FROM aftersale.tickets WHERE order_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
                String.class,
                id.toString());
    }

    private String paymentStatus(UUID id) {
        return jdbc.queryForObject(
                "SELECT status FROM payment.payments WHERE order_id = ?::uuid", String.class, id.toString());
    }

    private int eventCount() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM aftersale.ticket_events e JOIN aftersale.tickets t ON t.id = e.ticket_id WHERE t.order_id = ?::uuid",
                Integer.class,
                orderId.toString());
    }

    @Test
    void 退货退款全链路_同意后未退款_回寄后收货退款并回补库存() {
        // 申请退货退款 → APPLYING；订单投影同步；时间线一条
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, "质量不行");
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus());
        assertEquals("APPLYING", orderProjection());
        assertEquals(1, eventCount());

        // 同一订单不能再开一张进行中的单
        BusinessException dup = assertThrows(
                BusinessException.class,
                () -> afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, null));
        assertEquals(409, dup.getHttpStatus());

        // 卖家同意 → 进入退货流程 RETURNING（此时未退款，流水仍 SUCCESS）
        afterSale.agree(shopId, orderId);
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus());
        assertEquals(3, totalStock()); // 未退款也未回补

        // 买家回寄填物流：态不变（仍 RETURNING），售后单落展示投影，包裹落在 logistics（RETURN 方向）
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
        String logistics = jdbc.queryForObject(
                "SELECT return_logistics_company || '|' || return_tracking_no FROM aftersale.tickets WHERE order_id = ?::uuid",
                String.class,
                orderId.toString());
        assertEquals("中通快递|ZT999", logistics, "承运商名归一成字典名（code 优先）");
        assertEquals(
                "RETURN|中通快递|PICKED_UP",
                jdbc.queryForObject(
                        "SELECT direction || '|' || carrier_name || '|' || status FROM logistics.shipments WHERE tracking_no = 'ZT999'",
                        String.class),
                "回寄包裹进了同一套包裹模型：能接推送、能被轮询、能展示轨迹");

        // 卖家确认收货 → REFUNDED：退款落账（走网关）+ 库存回补（货回来了 3 → 5）+ 订单投影与退款口径写回
        afterSale.receiveReturn(shopId, orderId);
        assertEquals(TicketStatus.REFUNDED.name(), ticketStatus());
        assertEquals("REFUNDED", orderProjection());
        assertEquals(
                2000L,
                jdbc.queryForObject(
                        "SELECT refund_amount FROM orders.orders WHERE id = ?::uuid", Long.class, orderId.toString()));
        assertEquals(5, totalStock());
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus());
        assertNotNull(jdbc.queryForObject(
                "SELECT refund_gateway_no FROM payment.payments WHERE order_id = ?::uuid",
                String.class,
                orderId.toString()));

        // 已退款终态：再确认收货应 409（没有进行中的单），时间线不多记
        int events = eventCount();
        BusinessException ex = assertThrows(BusinessException.class, () -> afterSale.receiveReturn(shopId, orderId));
        assertEquals(409, ex.getHttpStatus());
        assertEquals(events, eventCount());
    }

    @Test
    void 仅退款_同意即退款_不回补库存() {
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, null);
        afterSale.agree(shopId, orderId);

        assertEquals(TicketStatus.REFUNDED.name(), ticketStatus());
        assertEquals("REFUNDED", orderProjection());
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus());
        assertEquals(3, totalStock()); // 货不退，库存不动
    }

    @Test
    void 待收货期间可申请售后_争议未决时自动确认收货让位_售后结了才落完成() {
        // 再下一单，只走到发货：不点确认收货，让「待收货」成为买家唯一讲理的阶段
        Order shipped = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 1)), null, null))
                .getFirst();
        UUID shippedId = shipped.getId();
        Payment unpaid = paymentService.pay(userId, shippedId);
        paymentService.confirm(userId, unpaid.getId());
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, shippedId, "SF", "SF222"));
        assertEquals("SHIPPED", orderStatus(shippedId));

        // 待收货即可申请，不必等 7 天自动确认收货把「没收到」伪装成「已收货」
        afterSale.apply(userId, shippedId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, "包裹在路上，我已经拒收");
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus(shippedId));

        // 争议未决：到期扫描该跑，但不该替买家宣布收货
        jdbc.update(
                "UPDATE orders.orders SET receive_expire_at = now() - interval '1 minute' WHERE id = ?::uuid",
                shippedId.toString());
        timeouts.sweep(OrderTimeout.RECEIVE);
        assertEquals("SHIPPED", orderStatus(shippedId));

        // 卖家同意仅退款：钱退了，履约主线不动（退款不推进订单状态）
        afterSale.agree(shopId, shippedId);
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus(shippedId));
        assertEquals("SHIPPED", orderStatus(shippedId));

        // 售后单落到终态后，同一轮扫描自愈：订单转完成并回填售后申请窗口
        timeouts.sweep(OrderTimeout.RECEIVE);
        assertEquals("COMPLETED", orderStatus(shippedId));
    }

    @Test
    void 已退款订单_再次申请售后_拒绝() {
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, null);
        afterSale.agree(shopId, orderId);
        assertEquals(TicketStatus.REFUNDED.name(), ticketStatus());

        // REFUNDED 终态：换类型重新申请也被挡（闸门看的是最新单的态，不是 type）
        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, "还想退"));
        assertEquals(409, ex.getHttpStatus());
        assertEquals("AFTER_SALE_ALREADY_REFUNDED", ex.getCode());
        // 不多造单：最新一张仍是原来那张 REFUNDED
        assertEquals(
                2000L,
                jdbc.queryForObject(
                        "SELECT refund_amount FROM aftersale.tickets WHERE order_id = ?::uuid ORDER BY created_at DESC LIMIT 1",
                        Long.class,
                        orderId.toString()));
    }

    @Test
    void 撤销后_再次申请售后_放行() {
        // 闸门只挡 REFUNDED：撤销（CLOSED 终态）不伤买家利益，窗口内可重新申请
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, null);
        afterSale.cancel(userId, orderId);

        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, "换个理由再来");
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus());
    }

    @Test
    void 卖家工作台列表_带订单摘要_按状态筛选且不串店() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, "质量不行");

        PageResult<SellerTicketItem> all = afterSale.pageShop(shopId, null, new PageParams(1, 10));
        assertEquals(1, all.total());
        SellerTicketItem item = all.records().getFirst();
        // 售后单本体
        assertEquals(orderId, item.orderId());
        assertEquals(TicketType.RETURN_REFUND, item.type());
        assertEquals(TicketStatus.APPLYING, item.status());
        assertEquals("质量不行", item.reason());
        assertEquals(2000L, item.refundAmount().amount());
        // 订单摘要：跨 schema 只读点查后内存拼装（订单号/买家/行数/首个商品名）
        assertNotNull(item.orderNo());
        assertEquals("张三", item.receiverName());
        assertEquals(1, item.itemCount(), "件数口径与卖家订单列表一致：行项行数，同一 SKU 合并成一行");
        assertEquals("测试SKU", item.firstItemName(), "行项快照名 = SKU 展示名，不回落 SPU 名");

        // 状态筛选：进行中的看得到，还没发生的终态看不到
        assertEquals(
                1, afterSale.pageShop(shopId, "APPLYING", new PageParams(1, 10)).total());
        assertEquals(
                0, afterSale.pageShop(shopId, "REFUNDED", new PageParams(1, 10)).total());

        // 归属闸门：别的店看不到本店的售后单（不是先查再过滤，而是查询条件里就没有它）
        assertEquals(
                0,
                afterSale
                        .pageShop(UUID.randomUUID(), null, new PageParams(1, 10))
                        .total());

        // 非法筛选值 400，不静默当成「全部」
        BusinessException bad = assertThrows(
                BusinessException.class, () -> afterSale.pageShop(shopId, "NOT_A_STATUS", new PageParams(1, 10)));
        assertEquals(400, bad.getHttpStatus());
    }

    @Test
    void 越权_他人订单申请与他店处理一律404() {
        assertEquals(
                404,
                assertThrows(
                                BusinessException.class,
                                () -> afterSale.apply(
                                        UUID.randomUUID(),
                                        orderId,
                                        TicketType.REFUND_ONLY,
                                        AfterSaleReason.QUALITY_ISSUE,
                                        null))
                        .getHttpStatus());
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, null);
        assertEquals(
                404,
                assertThrows(BusinessException.class, () -> afterSale.reject(UUID.randomUUID(), orderId, "不是我的单"))
                        .getHttpStatus());
    }

    @Test
    void 回寄覆盖更新_重复提交只留一张有效包裹_旧轨迹随旧包裹作废() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, null);
        afterSale.agree(shopId, orderId);

        // 首次提交：落 RETURN 包裹，并模拟旧单号已被承运商推出在途轨迹
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        String oldShipmentId =
                jdbc.queryForObject("SELECT id FROM logistics.shipments WHERE tracking_no = 'ZT999'", String.class);
        jdbc.update(
                "INSERT INTO logistics.tracking_nodes (shipment_id, node_code, description, occurred_at, dedupe_key)"
                        + " VALUES (?::uuid, 'ARRIVED_HUB', '到达分拨中心', NOW(), ?)",
                oldShipmentId,
                "it-hub|" + oldShipmentId);

        // 重交同一运单号：旧包裹先作废，不再撞自己的唯一索引（改单号的经典误操作路径）
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        // 再换单号提交：覆盖生效
        afterSale.returnGoods(userId, orderId, "SF", "顺丰快递", "SF888");

        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.shipments WHERE order_id = ?::uuid AND direction = 'RETURN'",
                        Integer.class,
                        orderId.toString()),
                "买家侧售后卡与物流页从此只见最新一条有效回寄");
        assertEquals(
                "SF888",
                jdbc.queryForObject(
                        "SELECT return_tracking_no FROM aftersale.tickets WHERE order_id = ?::uuid",
                        String.class,
                        orderId.toString()));
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.tracking_nodes WHERE shipment_id = ?::uuid",
                        Integer.class,
                        oldShipmentId),
                "旧单号的轨迹跟着旧包裹一起作废，不挂到新单号上");
    }

    /**
     * 退货阶段拒绝（AFS-18 的 REJECT_RETURN）：卖家验货不通过时有出口，但这条边只改售后单的 fate——
     * 钱不退、库存不回补（货没通过验收），买家的那条路是在申请窗口内重新申请。
     */
    @Test
    void 退货已寄回_卖家验货不通过拒绝退款_钱与库存都不动_买家仍能重申() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, "尺码不合");
        afterSale.agree(shopId, orderId);
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");

        afterSale.reject(shopId, orderId, "退回商品吊牌剪掉，影响二次销售");

        assertEquals(TicketStatus.REJECTED.name(), ticketStatus());
        assertEquals("REJECTED", orderProjection());
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus(), "拒绝退款不该把钱退出去");
        assertEquals(3, totalStock(), "货没通过验收，不算回补");
        Ticket rejected = afterSale.latestForBuyer(userId, orderId).orElseThrow();
        assertEquals(List.of(TicketAvailableAction.REAPPLY), afterSale.buyerActions(rejected));
    }

    /** 拒绝理由（AFS-30/44）：必填、只落在时间线那行 note 上，买家详情读它而不是读 tickets 的复制列 */
    @Test
    void 拒绝理由落时间线并随买家详情下发_未被拒时不给理由() {
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, "不想要了");
        Ticket applying = afterSale.latestForBuyer(userId, orderId).orElseThrow();
        assertNull(afterSale.buyerDetail(applying).rejectReason(), "没被拒过就不该有一行拒绝理由");

        afterSale.reject(shopId, orderId, "生鲜类目不支持无理由退货");

        Ticket rejected = afterSale.latestForBuyer(userId, orderId).orElseThrow();
        assertEquals("生鲜类目不支持无理由退货", afterSale.buyerDetail(rejected).rejectReason());
        assertEquals(
                "SELLER|REJECT|生鲜类目不支持无理由退货",
                jdbc.queryForObject(
                        "SELECT e.actor || '|' || e.action || '|' || e.note FROM aftersale.ticket_events e"
                                + " JOIN aftersale.tickets t ON t.id = e.ticket_id"
                                + " WHERE t.order_id = ?::uuid AND e.action = 'REJECT'",
                        String.class,
                        orderId.toString()),
                "理由的真相只有一处：ticket_events.note");
    }

    /**
     * 七天无理由强制（消保法第 25 条）：买家以「无理由」申请退货退款、且在收到商品七天内、订单快照里每件都支持
     * 无理由时，受理阶段卖家只剩「同意」——拒绝受理是违法的，连售后单的 fate 都不该被它动一下。
     * 退货阶段的验货不通过是另一件事：那条边照旧留着（买家寄回来的东西可以有问题）。
     */
    @Test
    void 七天无理由退货_受理阶段只下发同意_拒绝落点409_退货阶段验货拒绝照旧() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.NO_REASON, "尺码不合");

        Ticket enforcing = afterSale.latestForBuyer(userId, orderId).orElseThrow();
        assertTrue(enforcing.isNoReasonEnforced());
        assertEquals(
                "NO_REASON",
                jdbc.queryForObject(
                        "SELECT reason_code FROM aftersale.tickets WHERE id = ?::uuid",
                        String.class,
                        enforcing.getId().toString()));

        // 工作台行与订单行内按钮一起收走「拒绝」：下发的是动作集，不是「按钮点了再报错」
        assertEquals(
                List.of(TicketAvailableAction.AGREE),
                afterSale
                        .pageShop(shopId, null, new PageParams(1, 10))
                        .records()
                        .getFirst()
                        .availableActions());
        assertEquals(
                List.of(TicketAvailableAction.AGREE),
                afterSale
                        .sellerActionsByOrders(shopId, List.of(orderId))
                        .getFirst()
                        .availableActions());

        BusinessException ex =
                assertThrows(BusinessException.class, () -> afterSale.reject(shopId, orderId, "拆封影响二次销售"));
        assertEquals(409, ex.getHttpStatus());
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus(), "违法的拒绝连落点都进不去");
        assertEquals(3, totalStock());

        // 同意 → 回寄 → RETURNING：强制只管受理这一段，验货拒绝的出口回来
        afterSale.agree(shopId, orderId);
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT998");
        assertEquals(
                List.of(TicketAvailableAction.RECEIVE_RETURN, TicketAvailableAction.REJECT),
                afterSale
                        .pageShop(shopId, null, new PageParams(1, 10))
                        .records()
                        .getFirst()
                        .availableActions());
        afterSale.reject(shopId, orderId, "退回商品与下单型号不符");
        assertEquals(TicketStatus.REJECTED.name(), ticketStatus());
    }

    /** 强制的三条腿缺一条就不成立（宁可少强制，不可错强制）：收到商品已过七天，卖家的拒绝权跟着回来 */
    @Test
    void 无理由退货超七天窗口_不再强制_卖家可拒绝受理() {
        jdbc.update(
                "UPDATE orders.orders SET completed_at = now() - interval '8 days' WHERE id = ?::uuid",
                orderId.toString());

        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.NO_REASON, "不喜欢了");

        assertFalse(afterSale.latestForBuyer(userId, orderId).orElseThrow().isNoReasonEnforced());
        afterSale.reject(shopId, orderId, "无理由退货已过七天期限");
        assertEquals(TicketStatus.REJECTED.name(), ticketStatus());
    }

    /** 第二条腿：下单时这一单就不支持无理由——判定读订单快照，也要求快照里每件都支持（拼单只有一件可退则不强制） */
    @Test
    void 订单快照不支持无理由_不再强制_卖家可拒绝受理() {
        jdbc.update("UPDATE orders.items SET seven_day_return = FALSE WHERE order_id = ?::uuid", orderId.toString());

        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.NO_REASON, "不喜欢了");

        assertFalse(afterSale.latestForBuyer(userId, orderId).orElseThrow().isNoReasonEnforced());
        afterSale.reject(shopId, orderId, "定制商品，下单页已明示不支持七天无理由退货");
        assertEquals(TicketStatus.REJECTED.name(), ticketStatus());
    }

    /** 权利在下单那一刻定终身：卖家事后把商品的七天无理由关掉，抹不掉买家买到时手上的那份（读快照不读商品现值） */
    @Test
    void 卖家事后关掉商品开关_订单快照仍保留买家的无理由权利() {
        jdbc.update(
                "UPDATE product.products SET seven_day_return = FALSE"
                        + " WHERE id = (SELECT product_id FROM product.skus WHERE id = ?::uuid)",
                skuId.toString());

        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.NO_REASON, null);

        assertTrue(afterSale.latestForBuyer(userId, orderId).orElseThrow().isNoReasonEnforced());
    }

    @Test
    void 动作下发_工作台行带卖家动作集_被拒单带重新申请_已退款单什么都不给() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, null);

        // 卖家工作台行：APPLYING 下发 同意/拒绝（顺序即声明序，前端照单渲染）
        SellerTicketItem row = afterSale
                .pageShop(shopId, null, new PageParams(1, 10))
                .records()
                .getFirst();
        assertEquals(List.of(TicketAvailableAction.AGREE, TicketAvailableAction.REJECT), row.availableActions());

        // 卖家拒绝后：卖家侧终态无动作；买家侧下发「重新申请」（申请窗口未过，AFS-04）
        afterSale.reject(shopId, orderId, "商品无质量问题，鉴定通过");
        Ticket rejected = afterSale.latestForShop(shopId, orderId).orElseThrow();
        assertEquals(List.of(), TicketAvailableAction.sellerActions(rejected.getStatus(), false));
        assertEquals(List.of(TicketAvailableAction.REAPPLY), afterSale.buyerActions(rejected));

        // 退款终态：什么都不下发（与 apply 的二次退款闸门同源，AFS-05）
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, AfterSaleReason.QUALITY_ISSUE, null);
        afterSale.agree(shopId, orderId);
        Ticket refunded = afterSale.latestForBuyer(userId, orderId).orElseThrow();
        assertEquals(List.of(), afterSale.buyerActions(refunded));
    }

    /** 订单列表行内按钮的动作集（批查）：只回有进行中单的订单，动作与工作台同源，越店不参与 */
    @Test
    void 按订单批查卖家售后动作_进行中才回_终态与他店不回() {
        // 无售后单：这一行压根不出现在结果里（前端取不到 = 无动作，不下发空集合）
        assertEquals(List.of(), afterSale.sellerActionsByOrders(shopId, List.of(orderId)));

        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, null);
        assertEquals(
                List.of(TicketAvailableAction.AGREE, TicketAvailableAction.REJECT),
                afterSale
                        .sellerActionsByOrders(shopId, List.of(orderId))
                        .getFirst()
                        .availableActions());

        // 同意后进 RETURNING：动作换成确认收货 + 拒绝（验货不通过有出口），仍只有这一张进行中的单
        afterSale.agree(shopId, orderId);
        assertEquals(
                List.of(TicketAvailableAction.RECEIVE_RETURN, TicketAvailableAction.REJECT),
                afterSale
                        .sellerActionsByOrders(shopId, List.of(orderId))
                        .getFirst()
                        .availableActions());

        // 归属闸门 + 空入参：递别人的 shopId 拿不到本店的单，递空列表不发查询
        assertEquals(
                0,
                afterSale
                        .sellerActionsByOrders(UUID.randomUUID(), List.of(orderId))
                        .size());
        assertEquals(List.of(), afterSale.sellerActionsByOrders(shopId, List.of()));
    }

    /** 回寄地址（详情查询时下发）：无默认退货地址为 null；配了实时解析成一行「收件人 电话 · 地址行」 */
    @Test
    void 退货退款进入RETURNING_回寄地址随查询解析_无默认退货地址为null() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, AfterSaleReason.QUALITY_ISSUE, null);
        afterSale.agree(shopId, orderId); // → RETURNING，买家从此要往卖家地址寄

        // 种子只有默认发货地址（default_ship），默认退货地址缺席 → null，前端据此引导联系客服
        assertNull(afterSale.resolveReturnAddress(shopId));

        UUID returnAddressId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.addresses (id, shop_id, contact_name, phone, region_code, province, city, district, detail, default_return) "
                        + "VALUES (?::uuid, ?::uuid, '退件员', '13800001234', '330106', '浙江省', '杭州市', '西湖区', '文一路 100 号', TRUE)",
                returnAddressId.toString(),
                shopId.toString());
        db.onDelete("DELETE FROM shop.addresses WHERE id = ?::uuid", returnAddressId.toString());

        assertEquals("退件员 13800001234 · 浙江省杭州市西湖区文一路 100 号", afterSale.resolveReturnAddress(shopId));

        // 实时解析而不是快照：卖家换掉默认退货地址，买家看到的就是新的
        jdbc.update(
                "UPDATE shop.addresses SET contact_name = '新收件人', default_return = FALSE WHERE id = ?::uuid",
                returnAddressId.toString());
        assertNull(afterSale.resolveReturnAddress(shopId), "默认标记被摘掉即回到 null，不留下定格旧值");
    }
}
