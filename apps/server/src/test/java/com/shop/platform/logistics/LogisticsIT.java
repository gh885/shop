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
import com.shop.platform.logistics.service.CarrierPush;
import com.shop.platform.logistics.service.CarrierPushReceiver;
import com.shop.platform.logistics.service.CarrierTrackingGateway;
import com.shop.platform.logistics.service.CarrierTrackingNode;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.OrderTracking;
import com.shop.platform.logistics.service.ShipmentIssueService;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.logistics.service.ShipmentTracking;
import com.shop.platform.logistics.service.TrackingPushService;
import com.shop.platform.logistics.service.TrackingService;
import com.shop.platform.logistics.service.TrackingSyncService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
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
 * 物流闭环集成验证（真库）：发货落包裹 → 轨迹节点推进状态 → 重推与乱序不改终态 →
 * 一单多包裹 → 签收牵动订单（收货倒计时从签收起算）→ 买家查询的归属闸门。
 *
 * <p>走真实订单链路（下单 → 支付 → 发货）而不是直接调 mapper：要验的正是"这几步真的接得上"
 * ——发货同事务落包裹并推进订单、签收同事务回写订单投影。
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

    // 承运商是我们控制不了的外部系统：真库 IT 也只把"上游"换成假的，落库链路（去重/单调推进/签收回写）
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
        // 登记顺序 = 父表在前，purge 逆序执行 → 先删轨迹再删包裹
        db.onDelete("DELETE FROM logistics.shipments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM logistics.tracking_nodes WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete(
                "DELETE FROM logistics.shipment_issues WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");
        db.onDelete("DELETE FROM account.users WHERE id = ?::uuid", userId.toString());

        // 下单入口的账号闸门要求真实 ACTIVE 账号（幽灵 uuid 会被 403 拒单）；手机号按 uuid 派生避免并发跑撞唯一索引
        jdbc.update(
                "INSERT INTO account.users (id, phone, status) VALUES (?::uuid, ?, 'ACTIVE')",
                userId.toString(),
                "139" + Math.abs(userId.getMostSignificantBits() % 100_000_000L));
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

    private ShipmentStatus statusOf(UUID shipmentId) {
        return jdbc.queryForObject(
                "SELECT status FROM logistics.shipments WHERE id = ?::uuid",
                ShipmentStatus.class,
                shipmentId.toString());
    }

    private OffsetDateTime orderColumn(UUID orderId, String column) {
        return jdbc.queryForObject(
                "SELECT " + column + " FROM orders.orders WHERE id = ?::uuid",
                OffsetDateTime.class,
                orderId.toString());
    }

    /** 发货并取回包裹 ID：运单号带订单前缀，避免用例之间撞唯一索引 */
    private UUID dispatch(UUID orderId, String carrierCode, String trackingNo) {
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, orderId, carrierCode, trackingNo));
        return jdbc.queryForObject("SELECT id FROM logistics.shipments WHERE tracking_no = ?", UUID.class, trackingNo);
    }

    @Test
    void 发货落包裹_轨迹逐节点推进状态_重推与乱序不改终态() {
        UUID orderId = seedPaidOrder();
        String trackingNo = "SF" + orderId.toString().substring(0, 12);
        UUID shipmentId = dispatch(orderId, "SF", trackingNo);

        // 1. 发货即落包裹：待揽收，承运商名/运单号/寄件人快照都是发货那一刻定格的
        OrderTracking tracking = shipmentService.trackingOfOrder(userId, orderId);
        assertEquals(1, tracking.shipments().size());
        ShipmentTracking shipped = tracking.shipments().getFirst();
        assertEquals(ShipmentStatus.PENDING_PICKUP, shipped.shipment().getStatus());
        assertEquals("SF", shipped.shipment().getCarrierCode());
        assertEquals("顺丰速运", shipped.shipment().getCarrierName());
        assertNotNull(shipped.shipment().getShippedAt());
        assertNull(shipped.shipment().getDeliveredAt());
        assertEquals("发货员", shipped.shipment().getShipFromContactName(), "寄件人快照在包裹上定格");
        assertEquals(0, shipped.nodes().size(), "不发假节点：揽收前没有承运商事实");

        // 2. 节点按事实推进状态：揽收 → 到达分拨（运输中）→ 派送中
        OffsetDateTime base = OffsetDateTime.now().minusHours(6).truncatedTo(ChronoUnit.MILLIS);
        recordNode(shipmentId, TrackingNodeCode.PICKED_UP, base, "杭州西湖网点");
        assertEquals(ShipmentStatus.PICKED_UP, statusOf(shipmentId));
        recordNode(shipmentId, TrackingNodeCode.ARRIVED_HUB, base.plusHours(2), "杭州转运中心");
        assertEquals(ShipmentStatus.IN_TRANSIT, statusOf(shipmentId));
        recordNode(shipmentId, TrackingNodeCode.OUT_FOR_DELIVERY, base.plusHours(5), "上海浦东网点");
        assertEquals(ShipmentStatus.DELIVERING, statusOf(shipmentId));

        // 3. 签收：状态到终态、回填签收时刻，并把订单的收货窗口改从签收起算
        OffsetDateTime deliveredAt = base.plusHours(6);
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        assertEquals(ShipmentStatus.DELIVERED, statusOf(shipmentId));
        assertEquals(
                deliveredAt.toInstant(),
                jdbc.queryForObject(
                                "SELECT delivered_at FROM logistics.shipments WHERE id = ?::uuid",
                                Timestamp.class,
                                shipmentId.toString())
                        .toInstant());
        assertEquals(
                deliveredAt.toInstant(), orderColumn(orderId, "delivered_at").toInstant(), "签收要回写到订单投影");
        assertEquals(
                deliveredAt.plus(OrderTimeouts.RECEIVE).toInstant(),
                orderColumn(orderId, "receive_expire_at").toInstant(),
                "收货倒计时从签收起算，不再按发货时刻");

        // 4. 重推：同节点码 + 同时刻 + 同地点再录一遍，行数不变、状态不变（去重靠业务唯一键，不靠推送方 message id）
        int before = nodeCountOf(shipmentId);
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        assertEquals(before, nodeCountOf(shipmentId));

        // 5. 乱序/迟到：签收后才到的中转节点照样落库供人看，但不允许把状态倒回运输中，也不再把订单窗口往后推
        recordNode(shipmentId, TrackingNodeCode.DEPARTED_HUB, base.plusHours(3), "杭州转运中心");
        assertEquals(before + 1, nodeCountOf(shipmentId));
        assertEquals(ShipmentStatus.DELIVERED, statusOf(shipmentId));
        assertEquals(
                deliveredAt.plus(OrderTimeouts.RECEIVE).toInstant(),
                orderColumn(orderId, "receive_expire_at").toInstant(),
                "迟到节点不得重算收货窗口");

        // 6. 轨迹按时序返回：迟到补推的节点按事件时刻插回原位
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

    @Test
    void 一单多包裹_每个包裹各自推进_订单只推进一次() {
        UUID orderId = seedPaidOrder();
        UUID first = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 10) + "A");
        UUID second = dispatch(orderId, "ZTO", "ZT" + orderId.toString().substring(0, 10) + "B");

        assertNotNull(first);
        assertNotNull(second);

        OrderTracking tracking = shipmentService.trackingOfOrder(userId, orderId);
        assertEquals(2, tracking.shipments().size(), "一单可多包裹");
        assertEquals("ZTO", tracking.shipments().get(1).shipment().getCarrierCode());

        // 两个包裹各自有独立状态：第一个签收不影响第二个
        OffsetDateTime base = OffsetDateTime.now().minusHours(3).truncatedTo(ChronoUnit.MILLIS);
        recordNode(first, TrackingNodeCode.DELIVERED, base, "上海浦东网点");
        assertEquals(ShipmentStatus.DELIVERED, statusOf(first));
        assertEquals(ShipmentStatus.PENDING_PICKUP, statusOf(second));

        // 订单已发过货：不能再当"首次发货"重算窗口，签收也不再覆盖已写的 delivered_at
        assertEquals(base.toInstant(), orderColumn(orderId, "delivered_at").toInstant());
        recordNode(second, TrackingNodeCode.DELIVERED, base.plusHours(1), "上海浦东网点");
        assertEquals(
                base.toInstant(),
                orderColumn(orderId, "delivered_at").toInstant(),
                "首签即定格：订单只有一个 delivered_at，后到的包裹签收不重写它");
    }

    @Test
    void 包裹退回_收货窗口从退回时刻重算_已签收过的单不再被退回改动() {
        // 未签收过的单被退回：货没到买家手上，倒计时不能按发货时刻到期就把单转完成
        UUID returned = seedPaidOrder();
        UUID parcel = dispatch(returned, "SF", "SF" + returned.toString().substring(0, 10) + "R");
        OffsetDateTime returnedAt = OffsetDateTime.now().minusHours(1).truncatedTo(ChronoUnit.MILLIS);
        recordNode(parcel, TrackingNodeCode.RETURNED, returnedAt, "发件人所在网点");
        assertEquals(ShipmentStatus.RETURNED, statusOf(parcel));
        assertEquals(
                returnedAt.plus(OrderTimeouts.RECEIVE).toInstant(),
                orderColumn(returned, "receive_expire_at").toInstant(),
                "收货倒计时从退回时刻重算");
        assertNull(orderColumn(returned, "delivered_at"), "退回不是签收，不写签收投影");
        assertEquals(
                "SHIPPED",
                jdbc.queryForObject(
                        "SELECT status FROM orders.orders WHERE id = ?::uuid", String.class, returned.toString()));

        // 同单另一件已签收：签收是「买家拿到货」的更权威事实，之后另一件退回不重算窗口
        UUID signed = seedPaidOrder();
        UUID kept = dispatch(signed, "SF", "SF" + signed.toString().substring(0, 10) + "K");
        UUID back = dispatch(signed, "ZTO", "ZT" + signed.toString().substring(0, 10) + "B");
        OffsetDateTime deliveredAt = OffsetDateTime.now().minusHours(2).truncatedTo(ChronoUnit.MILLIS);
        recordNode(kept, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        recordNode(back, TrackingNodeCode.RETURNED, deliveredAt.plusHours(1), "发件人所在网点");
        assertEquals(
                deliveredAt.plus(OrderTimeouts.RECEIVE).toInstant(),
                orderColumn(signed, "receive_expire_at").toInstant(),
                "已签收的单不再被退回重算");
    }

    @Test
    void 异常节点_可被后续前向节点离开_不会永久卡死() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SFIT" + orderId.toString().substring(0, 10));

        OffsetDateTime base = OffsetDateTime.now().minusHours(4).truncatedTo(ChronoUnit.MILLIS);
        recordNode(shipmentId, TrackingNodeCode.PICKED_UP, base, "杭州网点");
        recordNode(shipmentId, TrackingNodeCode.EXCEPTION, base.plusHours(1), "上海转运中心");
        assertEquals(ShipmentStatus.EXCEPTION, statusOf(shipmentId));

        // 异常是过程态不是分支：滞留处理完继续派送，状态必须能前进
        recordNode(shipmentId, TrackingNodeCode.OUT_FOR_DELIVERY, base.plusHours(2), "上海网点");
        assertEquals(ShipmentStatus.DELIVERING, statusOf(shipmentId));
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
                assertThrows(BusinessException.class, () -> dispatch(otherOrderId, "ZTO", trackingNo));
        assertEquals(409, duplicated.getHttpStatus());

        // 未知快递公司 code：字典闸门拒绝，不落包裹
        UUID thirdOrderId = seedPaidOrder();
        BusinessException unknownCarrier = assertThrows(
                BusinessException.class,
                () -> dispatch(
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

        // 1. 推送：对方推三条，其中一条只有套话（两个信号都判不出来 → 跳过不猜）
        List<CarrierTrackingNode> pushed = List.of(
                new CarrierTrackingNode("1", "已揽收", "杭州", base),
                new CarrierTrackingNode("2", "快件已到达【杭州转运中心】", "杭州", base.plusHours(1)),
                new CarrierTrackingNode("0", "客官您好，感谢使用", null, base.plusHours(2)),
                new CarrierTrackingNode("3", "已签收，签收人：本人", "上海", base.plusHours(3)));
        when(pushReceiver.receive(any(), any(), any())).thenReturn(new CarrierPush(trackingNo, pushed));

        trackingPushService.accept("SF", "{}", "sign");
        assertEquals(3, nodeCountOf(shipmentId), "无法归一的节点不落库");
        assertEquals(ShipmentStatus.DELIVERED, statusOf(shipmentId));
        assertEquals(
                base.plusHours(3).toInstant(),
                orderColumn(orderId, "delivered_at").toInstant());

        // 2. 重推同一批：一行不增、状态不变（去重靠业务唯一键，推送方重推是常态）
        trackingPushService.accept("SF", "{}", "sign");
        assertEquals(3, nodeCountOf(shipmentId));

        // 3. 轮询：同一条落库路径，只落新节点
        when(gateway.available()).thenReturn(true);
        when(gateway.fetchTracker("SF", trackingNo))
                .thenReturn(List.of(
                        new CarrierTrackingNode("3", "已签收，签收人：本人", "上海", base.plusHours(3)),
                        new CarrierTrackingNode("2", "快件已离开【上海分拨中心】", "上海", base.plusHours(4))));
        assertEquals(1, trackingSyncService.sync(shipment));
        assertEquals(4, nodeCountOf(shipmentId));
        assertEquals(ShipmentStatus.DELIVERED, statusOf(shipmentId), "签收是终态，后到的中转节点不改状态");
    }

    /**
     * 异常治理闭环：停滞 → 开单；重复扫描不重复开单；包裹到终态 → 自动结单。
     * 判据只有时间，所以造场景的方式就是把 shipped_at 往前拨（不需要真等 24 小时）。
     */
    @Test
    void 停滞包裹开异常单_重复扫描不重复开单_到终态自动结单() {
        UUID orderId = seedPaidOrder();
        String trackingNo = "SF" + orderId.toString().substring(0, 12);
        UUID shipmentId = dispatch(orderId, "SF", trackingNo);

        // 1. 把发货时刻拨到 30 小时前：仍在待揽收，超过 24 小时阈值
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

    /** 客服手动结单：不存在 404、已结 409——不静默成功 */
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

        issueService.resolve(issueId, "已电话催件");
        assertEquals(
                ShipmentIssueStatus.RESOLVED.name(),
                jdbc.queryForObject(
                        "SELECT status FROM logistics.shipment_issues WHERE id = ?::uuid",
                        String.class,
                        issueId.toString()));

        assertEquals(
                409,
                assertThrows(BusinessException.class, () -> issueService.resolve(issueId, "再结一次"))
                        .getHttpStatus());
        assertEquals(
                404,
                assertThrows(BusinessException.class, () -> issueService.resolve(UUID.randomUUID(), null))
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
                ShipmentStatus.PICKED_UP, tracking.shipments().get(1).shipment().getStatus(), "买家刚交给承运商，起步就是已寄出");

        // 2. 回寄包裹照样吃推送：匹配按运单号，不看方向——这是复用同一模型最实际的收益
        OffsetDateTime base = OffsetDateTime.now().minusHours(2).truncatedTo(ChronoUnit.MILLIS);
        when(pushReceiver.receive(any(), any(), any()))
                .thenReturn(new CarrierPush(
                        returned.trackingNo(), List.of(new CarrierTrackingNode("2", "快件已到达【杭州转运中心】", "杭州", base))));
        trackingPushService.accept("ZTO", "{}", "sign");
        assertEquals(ShipmentStatus.IN_TRANSIT, statusOf(returned.shipmentId()));

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

    /** 签收后再确认收货仍由买家动作完成（物流不替买家点按钮）；这里钉死两条路径不冲突 */
    @Test
    void 签收后买家确认收货_正常到已完成() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = dispatch(orderId, "SF", "SF" + orderId.toString().substring(0, 12));
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, OffsetDateTime.now().minusHours(1), "上海浦东网点");

        orderTransitionService.receive(userId, orderId);
        assertEquals(
                OrderStatus.COMPLETED,
                jdbc.queryForObject(
                        "SELECT status FROM orders.orders WHERE id = ?::uuid",
                        com.shop.platform.order.model.OrderStatus.class,
                        orderId.toString()));
    }
}
