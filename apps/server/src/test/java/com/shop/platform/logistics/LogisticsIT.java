package com.shop.platform.logistics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.api.ReturnShipmentCommand;
import com.shop.platform.logistics.api.ReturnShipmentView;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentIssueStatus;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.model.TrackingStage;
import com.shop.platform.logistics.service.CarrierPush;
import com.shop.platform.logistics.service.CarrierPushReceiver;
import com.shop.platform.logistics.service.CarrierTrackingGateway;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.OrderTracking;
import com.shop.platform.logistics.service.ShipmentIssueService;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.logistics.service.ShipmentTracking;
import com.shop.platform.logistics.service.ShipmentTrackingView;
import com.shop.platform.logistics.service.TrackingPushService;
import com.shop.platform.logistics.service.TrackingService;
import com.shop.platform.logistics.service.TrackingSyncService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.order.service.OrderTransitionService;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.service.PaymentService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * 物流闭环集成验证（真库）：录单（待发货）→ 交寄（已发出）→ 轨迹落库 → 签收驱动完成 →
 * 取消包裹回退发货量 → 异常单闭环 → 逆向回寄复用同一模型。
 *
 * <p>走真实订单链路（下单 → 支付 → 录单 → 交寄）而不是直接调 mapper：要验的正是"这几步真的接得上"
 * ——交寄与行账本同事务、签收与订单完成同事务、取消与回退同事务。包裹状态是时间戳镜像，
 * 轨迹只影响展示阶段与三个触发事实（已动身 / 签收 / 退回）。
 */
@SpringBootTest
class LogisticsIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private OrderTransitionService orderTransitionService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private ShipmentService shipmentService;

    @Autowired
    private TrackingService trackingService;

    @Autowired
    private TrackingSyncService trackingSyncService;

    @Autowired
    private TrackingPushService trackingPushService;

    @Autowired
    private ShipmentMapper shipmentMapper;

    @Autowired
    private ShipmentIssueService issueService;

    /** 逆向能力经 api 命令暴露（消费方是 aftersale）；IT 直接调用它来造回寄场景 */
    @Autowired
    private ReturnShipmentCommand returnShipmentCommand;

    // 承运商是我们控制不了的外部系统：真库 IT 也只把"上游"换成假的，落库链路（去重/触发/签收回写）
    // 全部是真的。可用性默认为 false，故 @Scheduled 的轮询任务在这些用例之外不会空转
    @MockitoBean
    private CarrierTrackingGateway gateway;

    @MockitoBean
    private CarrierPushReceiver pushReceiver;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    /**
     * 共用夹具（一个用例只建一次）：默认发货地址在本店有唯一索引，重复种会撞 uk_addresses_default_ship，
     * 所以店铺侧夹具与"建几笔订单"分开。
     */
    private void seedFixtures() {
        if (skuId != null) {
            return;
        }
        // 下单入口的账号闸门要求真实 ACTIVE 账号（幽灵 uuid 会被 403 拒单）；
        // 账号先登记，包裹/轨迹/支付/订单这些同一条链路上的行随后按 userId 一起登记
        db.seedActiveUser(userId);
        db.onDeleteBuyerOrderChain(userId);
        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);
    }

    /** 建一个已付款（待发货）订单：单价 1000 分；物流与订单测试数据一律按 userId 圈定登记清理 */
    private UUID seedPaidOrder() {
        seedFixtures();
        Order order = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 1)), null, null))
                .orders()
                .getFirst();
        Payment pending = paymentService.pay(userId, order.getId());
        paymentService.confirm(userId, pending.getId());
        return order.getId();
    }

    private void recordNode(UUID shipmentId, TrackingNodeCode code, OffsetDateTime at, String location) {
        trackingService.recordNode(shipmentId, new TrackingNodeRequest(code, at, code.name() + " 描述", location));
    }

    private int nodeCountOf(UUID shipmentId) {
        return jdbc.queryForObject(
                "SELECT count(*) FROM logistics.tracking_nodes WHERE shipment_id = ?::uuid",
                Integer.class,
                shipmentId.toString());
    }

    private ShipmentStatus shipmentStatusOf(UUID shipmentId) {
        return jdbc.queryForObject(
                "SELECT status FROM logistics.shipments WHERE id = ?::uuid",
                ShipmentStatus.class,
                shipmentId.toString());
    }

    private OrderStatus orderStatusOf(UUID orderId) {
        return jdbc.queryForObject(
                "SELECT status FROM orders.orders WHERE id = ?::uuid", OrderStatus.class, orderId.toString());
    }

    private int shippedQuantityOf(UUID orderId) {
        Integer sum = jdbc.queryForObject(
                "SELECT COALESCE(sum(shipped_quantity), 0) FROM orders.items WHERE order_id = ?::uuid",
                Integer.class,
                orderId.toString());
        return sum == null ? 0 : sum;
    }

    private OffsetDateTime orderColumn(UUID orderId, String column) {
        return jdbc.queryForObject(
                "SELECT " + column + " FROM orders.orders WHERE id = ?::uuid",
                OffsetDateTime.class,
                orderId.toString());
    }

    /** 该单第一行的发货行入参：IT 的订单都只有一行，发几件就是整行的多少件 */
    private List<DispatchShipmentCommand.Line> shipLines(UUID orderId) {
        UUID itemId = jdbc.queryForObject(
                "SELECT id FROM orders.items WHERE order_id = ?::uuid ORDER BY created_at, id LIMIT 1",
                UUID.class,
                orderId.toString());
        Integer quantity = jdbc.queryForObject(
                "SELECT quantity FROM orders.items WHERE id = ?::uuid", Integer.class, itemId.toString());
        return List.of(new DispatchShipmentCommand.Line(itemId, quantity));
    }

    /** 只录单（待发货）：不占有效发货量，订单也不推进 */
    private UUID recordShipment(UUID orderId, String carrierCode, String trackingNo) {
        return shipmentService.record(
                new DispatchShipmentCommand(shopId, orderId, carrierCode, trackingNo, shipLines(orderId)));
    }

    /** 录单 + 交寄（运单号带订单前缀，避免用例之间撞唯一索引） */
    private UUID dispatch(UUID orderId, String carrierCode, String trackingNo) {
        UUID shipmentId = shipmentService.record(
                new DispatchShipmentCommand(shopId, orderId, carrierCode, trackingNo, shipLines(orderId)));
        shipmentService.dispatch(shopId, shipmentId);
        return shipmentId;
    }

    @Test
    void 录单不占量_交寄才入账_签收驱动完成() {
        UUID orderId = seedPaidOrder();
        String trackingNo = "SF" + orderId.toString().substring(0, 12);

        // 1. 录单：落一张待发货包裹，承运商名/运单号/寄件人快照都是录单那一刻定格的；订单不动账
        UUID shipmentId = recordShipment(orderId, "SF", trackingNo);
        ShipmentTracking pending =
                shipmentService.trackingOfOrder(userId, orderId).shipments().getFirst();
        assertEquals(ShipmentStatus.PENDING_DISPATCH, pending.shipment().getStatus());
        assertEquals("SF", pending.shipment().getCarrierCode());
        assertEquals("顺丰速运", pending.shipment().getCarrierName());
        assertNull(pending.shipment().getShippedAt(), "待发货没有交寄时刻");
        assertEquals(0, pending.nodes().size(), "不发假节点：揽收前没有承运商事实");
        assertEquals(0, shippedQuantityOf(orderId), "待发货不占有效发货量");
        assertEquals(OrderStatus.PAID, orderStatusOf(orderId));

        // 2. 交寄：包裹转已发出，行账本入账，订单按结清量重算
        shipmentService.dispatch(shopId, shipmentId);
        assertEquals(ShipmentStatus.DISPATCHED, shipmentStatusOf(shipmentId));
        assertEquals(1, shippedQuantityOf(orderId));
        assertEquals(OrderStatus.SHIPPED, orderStatusOf(orderId), "全部行结清即已发货");
        assertNotNull(orderColumn(orderId, "shipped_at"));

        // 3. 轨迹节点只影响展示阶段：揽收 / 到达 / 派送都不改包裹履约态
        OffsetDateTime base = OffsetDateTime.now().minusHours(6).truncatedTo(ChronoUnit.MILLIS);
        recordNode(shipmentId, TrackingNodeCode.PICKED_UP, base, "杭州西湖网点");
        recordNode(shipmentId, TrackingNodeCode.ARRIVED_HUB, base.plusHours(2), "杭州转运中心");
        recordNode(shipmentId, TrackingNodeCode.OUT_FOR_DELIVERY, base.plusHours(5), "上海浦东网点");
        assertEquals(ShipmentStatus.DISPATCHED, shipmentStatusOf(shipmentId), "在途仍是已发出");
        ShipmentTrackingView view = ShipmentTrackingView.from(
                shipmentService.trackingOfOrder(userId, orderId).shipments().getFirst());
        assertEquals(TrackingStage.DELIVERING, view.nodes().getLast().stage(), "节点阶段由后端推导");

        // 4. 签收：包裹终态 + 订单自动收口到已完成（全部结清 + 全部签收）
        OffsetDateTime deliveredAt = base.plusHours(6);
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        assertEquals(ShipmentStatus.DELIVERED, shipmentStatusOf(shipmentId));
        assertEquals(
                deliveredAt.toInstant(),
                jdbc.queryForObject(
                                "SELECT signed_at FROM logistics.shipments WHERE id = ?::uuid",
                                Timestamp.class,
                                shipmentId.toString())
                        .toInstant());
        assertEquals(OrderStatus.COMPLETED, orderStatusOf(orderId), "全部签收 + 全部结清 = 完成");
        assertEquals(
                deliveredAt.toInstant(), orderColumn(orderId, "delivered_at").toInstant(), "签收回写到订单投影");
        assertNotNull(orderColumn(orderId, "completed_at"));

        // 5. 重推：同节点码 + 同时刻 + 同地点再录一遍，行数不变、状态不变（去重靠业务唯一键，不靠 message id）
        int before = nodeCountOf(shipmentId);
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        assertEquals(before, nodeCountOf(shipmentId));

        // 6. 乱序/迟到：签收后才到的中转节点照样落库供人看，但不允许把包裹状态倒回在途
        recordNode(shipmentId, TrackingNodeCode.DEPARTED_HUB, base.plusHours(3), "杭州转运中心");
        assertEquals(before + 1, nodeCountOf(shipmentId));
        assertEquals(ShipmentStatus.DELIVERED, shipmentStatusOf(shipmentId));

        // 7. 轨迹按时序返回：迟到补推的节点按事件时刻插回原位
        List<TrackingNodeCode> codes =
                shipmentService.trackingOfOrder(userId, orderId).shipments().getFirst().nodes().stream()
                        .map(n -> n.getNodeCode())
                        .toList();
        assertEquals(
                List.of(
                        TrackingNodeCode.PICKED_UP,
                        TrackingNodeCode.ARRIVED_HUB,
                        TrackingNodeCode.DEPARTED_HUB,
                        TrackingNodeCode.OUT_FOR_DELIVERY,
                        TrackingNodeCode.DELIVERED),
                codes);
    }

    /** 发货单闸门（§8）：同一子订单同一时刻只能有一张待发货单；取消待发货只释放名额、不动账本 */
    @Test
    void 待发货单_一单只允许一张_取消后释放名额() {
        UUID orderId = seedPaidOrder();
        UUID first = recordShipment(orderId, "SF", "SF" + orderId.toString().substring(0, 12));

        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> recordShipment(
                                        orderId,
                                        "ZTO",
                                        "ZT" + orderId.toString().substring(0, 12)))
                        .getHttpStatus(),
                "同一单不允许两张待发货单，否则同一批行被重复占位");

        // 取消待发货：名额释放，账本一动不动（它本来就没占）
        shipmentService.cancel(shopId, first);
        assertEquals(ShipmentStatus.CANCELLED, shipmentStatusOf(first));
        assertEquals(0, shippedQuantityOf(orderId));
        assertEquals(OrderStatus.PAID, orderStatusOf(orderId));

        // 名额释放后可以重新录单并交寄
        UUID again = dispatch(orderId, "ZTO", "ZT" + orderId.toString().substring(0, 12));
        assertEquals(ShipmentStatus.DISPATCHED, shipmentStatusOf(again));
        assertEquals(OrderStatus.SHIPPED, orderStatusOf(orderId));
    }

    /** 超发守卫与取消回退：整行结清后再发被拒；取消已发出的包裹把量退回来、订单退回待发货 */
    @Test
    void 超发被拒_取消已发出包裹回退账本() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));
        assertEquals(1, shippedQuantityOf(orderId));

        // 整行已结清：再录一张发货单在守卫处就 409，且不落包裹
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> recordShipment(
                                        orderId,
                                        "ZTO",
                                        "ZT" + orderId.toString().substring(0, 12)))
                        .getHttpStatus());
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.shipments WHERE order_id = ?::uuid",
                        Integer.class,
                        orderId.toString()));

        // 取消已发出的包裹：有效发货量回退，订单退回待发货（履约态允许回退，§8）
        shipmentService.cancel(shopId, shipmentId);
        assertEquals(0, shippedQuantityOf(orderId));
        assertEquals(OrderStatus.PAID, orderStatusOf(orderId));
        assertEquals(ShipmentStatus.CANCELLED, shipmentStatusOf(shipmentId));

        // 已取消的包裹不能重复取消，也不能再交寄
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> shipmentService.cancel(shopId, shipmentId))
                        .getHttpStatus());
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> shipmentService.dispatch(shopId, shipmentId))
                        .getHttpStatus());
    }

    /** 退回：货不会再送到买家 → 取消包裹（回退有效发货量），钱走售后单，不在物流里退 */
    @Test
    void 包裹退回_取消包裹并回退发货量_不写签收投影() {
        UUID orderId = seedPaidOrder();
        UUID parcel = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));
        OffsetDateTime returnedAt = OffsetDateTime.now().minusHours(1).truncatedTo(ChronoUnit.MILLIS);

        recordNode(parcel, TrackingNodeCode.RETURNED, returnedAt, "发件人所在网点");

        assertEquals(ShipmentStatus.CANCELLED, shipmentStatusOf(parcel));
        assertEquals(0, shippedQuantityOf(orderId), "退回的货变回未发件");
        assertEquals(OrderStatus.PAID, orderStatusOf(orderId));
        assertNull(orderColumn(orderId, "delivered_at"), "退回不是签收，不写签收投影");
    }

    /** 异常节点只落轨迹：包裹仍在途，状态不由承运商推送改写 */
    @Test
    void 异常节点_只落轨迹_不改包裹履约态() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SFIT" + orderId.toString().substring(0, 10));

        OffsetDateTime base = OffsetDateTime.now().minusHours(4).truncatedTo(ChronoUnit.MILLIS);
        recordNode(shipmentId, TrackingNodeCode.PICKED_UP, base, "杭州网点");
        recordNode(shipmentId, TrackingNodeCode.EXCEPTION, base.plusHours(1), "上海转运中心");
        assertEquals(ShipmentStatus.DISPATCHED, shipmentStatusOf(shipmentId));
        assertEquals(2, nodeCountOf(shipmentId));

        recordNode(shipmentId, TrackingNodeCode.OUT_FOR_DELIVERY, base.plusHours(2), "上海网点");
        assertEquals(ShipmentStatus.DISPATCHED, shipmentStatusOf(shipmentId), "异常处理完继续派送，履约态没变");
    }

    @Test
    void 查询轨迹_未发货与越权_同一句话术同一个404() {
        UUID orderId = seedPaidOrder();

        // 未发货：订单在，包裹还没有
        BusinessException notShipped =
                assertThrows(BusinessException.class, () -> shipmentService.trackingOfOrder(userId, orderId));
        assertEquals(404, notShipped.getHttpStatus());

        dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));

        // 越权：别人的订单，同一个 404 与同一句话术——不泄露单据存在性
        BusinessException notMine = assertThrows(
                BusinessException.class, () -> shipmentService.trackingOfOrder(UUID.randomUUID(), orderId));
        assertEquals(404, notMine.getHttpStatus());
        assertEquals(notShipped.getMessage(), notMine.getMessage());

        // 本人可读
        assertEquals(orderId, shipmentService.trackingOfOrder(userId, orderId).orderId());
        assertTrue(!shipmentService.enabledCarriers().isEmpty(), "字典要有可选承运商");
    }

    @Test
    void 发货闸门_运单号重复409_快递公司停用400() {
        UUID orderId = seedPaidOrder();
        String trackingNo = "SF" + orderId.toString().substring(0, 12);
        dispatch(orderId, "SF", trackingNo);

        // 另一个订单拿同一个运单号：唯一索引兜底（一个运单号只属于一个订单）
        UUID otherOrderId = seedPaidOrder();
        BusinessException duplicated =
                assertThrows(BusinessException.class, () -> recordShipment(otherOrderId, "ZTO", trackingNo));
        assertEquals(409, duplicated.getHttpStatus());

        // 未知快递公司 code：字典闸门拒绝，不落包裹
        UUID thirdOrderId = seedPaidOrder();
        BusinessException unknownCarrier = assertThrows(
                BusinessException.class,
                () -> recordShipment(
                        thirdOrderId, "NOPE", "SF" + thirdOrderId.toString().substring(0, 12)));
        assertEquals(400, unknownCarrier.getHttpStatus());
    }

    /**
     * 推送与轮询共用同一条落库路径：真实 TrackingPushService + 真实 TrackingSyncService + 真库，
     * 只把"承运商"换成假的（端口 mock）。要验的是两个方向行为一致、重推不增行、没法判定的节点被跳过。
     */
    @Test
    void 推送与轮询_同一条落库路径_重推不增行且无法归一的节点被跳过() {
        UUID orderId = seedPaidOrder();
        String trackingNo = "SF" + orderId.toString().substring(0, 12);
        UUID shipmentId = dispatch(orderId, "SF", trackingNo);
        OffsetDateTime base = OffsetDateTime.now().minusHours(5).truncatedTo(ChronoUnit.MILLIS);
        Shipment shipment = shipmentMapper.selectById(shipmentId);

        // 1. 推送：对方推四条，其中一条只有套话（两个信号都判不出来 → 跳过不猜）
        List<CarrierTrackingNode> pushed = List.of(
                new CarrierTrackingNode("1", "已揽收", "杭州", base),
                new CarrierTrackingNode("2", "快件已到达【杭州转运中心】", "杭州", base.plusHours(1)),
                new CarrierTrackingNode("0", "客官您好，感谢使用", null, base.plusHours(2)),
                new CarrierTrackingNode("3", "已签收，签收人：本人", "上海", base.plusHours(3)));
        when(pushReceiver.receive(any(), any(), any())).thenReturn(new CarrierPush(trackingNo, pushed));

        trackingPushService.accept("SF", "{}", "sign");
        assertEquals(3, nodeCountOf(shipmentId), "无法归一的节点不落库");
        assertEquals(ShipmentStatus.DELIVERED, shipmentStatusOf(shipmentId));
        assertEquals(
                base.plusHours(3).toInstant(),
                orderColumn(orderId, "delivered_at").toInstant());

        // 2. 重推同一批：一行不增、状态不变（去重靠业务唯一键，推送方重推是常态）
        trackingPushService.accept("SF", "{}", "sign");
        assertEquals(3, nodeCountOf(shipmentId));

        // 3. 轮询：同一条落库路径，只落新节点；签收是终态，后到的中转节点不改状态
        when(gateway.available()).thenReturn(true);
        when(gateway.fetchTracker("SF", trackingNo))
                .thenReturn(List.of(
                        new CarrierTrackingNode("3", "已签收，签收人：本人", "上海", base.plusHours(3)),
                        new CarrierTrackingNode("2", "快件已离开【上海分拨中心】", "上海", base.plusHours(4))));
        assertEquals(1, trackingSyncService.sync(shipment));
        assertEquals(4, nodeCountOf(shipmentId));
        assertEquals(ShipmentStatus.DELIVERED, shipmentStatusOf(shipmentId));
    }

    /**
     * 异常治理闭环：交寄后一直没有轨迹 → 超 24 小时开揽收超时单；重复扫描不重复开单；到终态自动结单。
     * 判据只有时间，所以造场景的方式就是把 shipped_at 往前拨（不需要真等 24 小时）。
     */
    @Test
    void 停滞包裹开异常单_重复扫描不重复开单_到终态自动结单() {
        UUID orderId = seedPaidOrder();
        String trackingNo = "SF" + orderId.toString().substring(0, 12);
        UUID shipmentId = dispatch(orderId, "SF", trackingNo);

        // 1. 把交寄时刻拨到 30 小时前：一条轨迹都没有，超过 24 小时阈值
        jdbc.update(
                "UPDATE logistics.shipments SET shipped_at = ? WHERE id = ?::uuid",
                OffsetDateTime.now().minusHours(30),
                shipmentId.toString());

        int opened = issueService.scan();
        assertTrue(opened >= 1, "停滞包裹应开出异常单");
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.shipment_issues WHERE shipment_id = ?::uuid AND type = 'PICKUP_TIMEOUT'",
                        Integer.class,
                        shipmentId.toString()));

        // 2. 再扫一轮：同一包裹同类异常只留一张未结单（否则列表会被噪音灌满）
        issueService.scan();
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.shipment_issues WHERE shipment_id = ?::uuid AND status = 'OPEN'",
                        Integer.class,
                        shipmentId.toString()));

        // 3. 包裹签收 → 未结单自动结掉（异常不再需要人处理，留着就是假待办）
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, OffsetDateTime.now(), "上海浦东网点");
        assertEquals(
                0,
                jdbc.queryForObject(
                        "SELECT count(*) FROM logistics.shipment_issues WHERE shipment_id = ?::uuid AND status = 'OPEN'",
                        Integer.class,
                        shipmentId.toString()),
                "到终态自动结单");
        assertEquals(
                ShipmentIssueStatus.RESOLVED.name(),
                jdbc.queryForObject(
                        "SELECT status FROM logistics.shipment_issues WHERE shipment_id = ?::uuid",
                        String.class,
                        shipmentId.toString()));
    }

    /** 客服手动结单：不存在 404、已结 409——不静默成功；结单同事务落一行审计账本（ACC 治理动作） */
    @Test
    void 手动结单_不存在404_已结409() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));
        jdbc.update(
                "UPDATE logistics.shipments SET shipped_at = ? WHERE id = ?::uuid",
                OffsetDateTime.now().minusHours(30),
                shipmentId.toString());
        issueService.scan();
        UUID issueId = jdbc.queryForObject(
                "SELECT id FROM logistics.shipment_issues WHERE shipment_id = ?::uuid",
                UUID.class,
                shipmentId.toString());

        UUID operatorId = UUID.randomUUID();
        issueService.resolve(issueId, operatorId, "已电话催件");
        db.onDelete("DELETE FROM audit.audit_records WHERE operator_id = ?::uuid", operatorId.toString());
        assertEquals(
                1,
                jdbc.queryForObject(
                        "SELECT count(*) FROM audit.audit_records WHERE action = 'logistics.shipment_issue.resolved' AND target_id = ?",
                        Integer.class,
                        issueId.toString()),
                "结单落一行审计账本（同一事务）");
        assertEquals(
                ShipmentIssueStatus.RESOLVED.name(),
                jdbc.queryForObject(
                        "SELECT status FROM logistics.shipment_issues WHERE id = ?::uuid",
                        String.class,
                        issueId.toString()));

        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> issueService.resolve(issueId, operatorId, "再结一次"))
                        .getHttpStatus());
        assertEquals(
                404,
                assertThrows(BusinessException.class, () -> issueService.resolve(UUID.randomUUID(), operatorId, null))
                        .getHttpStatus());
    }

    /**
     * 逆向统一：退货回寄走的是同一套包裹模型（RETURN 方向），因此白拿三件事——
     * 买家「查看物流」一起看得到、承运商推送按运单号就能匹配到、重复单号有唯一索引兜底。
     */
    @Test
    void 退货回寄_进同一套包裹模型_同屏可见且能接推送() {
        UUID orderId = seedPaidOrder();
        String forwardNo = "SF" + orderId.toString().substring(0, 12);
        dispatch(orderId, "SF", forwardNo);

        // 买家回寄（真实链路里由 aftersale 经 ReturnShipmentCommand 调用）
        ReturnShipmentView returned = returnShipmentCommand.record(
                orderId,
                userId,
                shopId,
                "ZTO",
                "中通快递",
                "ZT" + orderId.toString().substring(0, 12));
        assertEquals("中通快递", returned.carrierName(), "承运商名与卖家发货同口径归一");

        // 1. 买家一个接口看到两个方向：正向在前、回寄在后
        OrderTracking tracking = shipmentService.trackingOfOrder(userId, orderId);
        assertEquals(2, tracking.shipments().size());
        assertEquals(
                ShipmentDirection.FORWARD,
                tracking.shipments().get(0).shipment().getDirection());
        assertEquals(
                ShipmentDirection.RETURN, tracking.shipments().get(1).shipment().getDirection());
        assertEquals(
                ShipmentStatus.DISPATCHED,
                tracking.shipments().get(1).shipment().getStatus(),
                "买家刚交给承运商，起步就是已发出");

        // 2. 回寄包裹照样吃推送：匹配按运单号，不看方向——这是复用同一模型最实际的收益
        OffsetDateTime base = OffsetDateTime.now().minusHours(2).truncatedTo(ChronoUnit.MILLIS);
        when(pushReceiver.receive(any(), any(), any()))
                .thenReturn(new CarrierPush(
                        returned.trackingNo(), List.of(new CarrierTrackingNode("2", "快件已到达【杭州转运中心】", "杭州", base))));
        trackingPushService.accept("ZTO", "{}", "sign");
        assertEquals(1, nodeCountOf(returned.shipmentId()));
        assertEquals(ShipmentStatus.DISPATCHED, shipmentStatusOf(returned.shipmentId()));

        // 3. 同一运单号再被别人拿去回寄：唯一索引兜底
        UUID otherOrderId = seedPaidOrder();
        assertEquals(
                409,
                assertThrows(
                                BusinessException.class,
                                () -> returnShipmentCommand.record(
                                        otherOrderId, userId, shopId, "ZTO", "中通快递", returned.trackingNo()))
                        .getHttpStatus());
    }

    /** 网关不可用时轮询直接返回：本地开发没配承运商密钥，不该满屏报错也不该空转 */
    @Test
    void 网关未启用_轮询不拉取也不报错() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));
        when(gateway.available()).thenReturn(false);

        assertEquals(0, trackingSyncService.sync(shipmentMapper.selectById(shipmentId)));
        assertEquals(0, nodeCountOf(shipmentId));
    }

    /** 签收即完成：物流事实自己收口，不再需要买家点「确认收货」；之后再点确认收货是 409 */
    @Test
    void 签收即完成_买家再点确认收货409() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, OffsetDateTime.now().minusHours(1), "上海浦东网点");

        assertEquals(OrderStatus.COMPLETED, orderStatusOf(orderId));
        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> orderTransitionService.receive(userId, orderId))
                        .getHttpStatus());
    }
}
