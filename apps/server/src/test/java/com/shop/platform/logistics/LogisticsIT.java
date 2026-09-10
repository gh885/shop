package com.shop.platform.logistics;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.dto.TrackingNodeRequest;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.model.TrackingNodeCode;
import com.shop.platform.logistics.service.ShipmentService;
import com.shop.platform.logistics.service.ShipmentTracking;
import com.shop.platform.logistics.service.TrackingService;
import com.shop.platform.order.dto.CreateOrderRequest;
import com.shop.platform.order.dto.OrderLineRequest;
import com.shop.platform.order.dto.ShipOrderRequest;
import com.shop.platform.order.mapper.Order;
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

/**
 * 物流闭环集成验证（真库）：发货落包裹 → 轨迹节点推进状态 → 重推与乱序不改终态 → 买家查询的归属闸门。
 *
 * <p>走真实订单链路（下单 → 支付 → 发货）而不是直接发事件，因为要验的正是"发货这个动作真的会落出包裹"
 * ——这是同事务监听的全部意义。乱序/重推用录节点的方式造场景（真并发推送的乱序由三期 webhook 覆盖）。
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

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID addressId;

    /** 建一个已付款（待发货）订单：单价 1000 分；物流与订单测试数据一律按 userId 圈定登记清理 */
    private UUID seedPaidOrder() {
        // 登记顺序 = 父表在前，purge 逆序执行 → 先删轨迹再删包裹
        db.onDelete("DELETE FROM logistics.shipments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM logistics.tracking_nodes WHERE shipment_id IN (SELECT id FROM logistics.shipments WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
        db.onDelete(
                "DELETE FROM orders.items WHERE order_id IN (SELECT id FROM orders.orders WHERE user_id = ?::uuid)",
                userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM kernel.event_publication WHERE serialized_event LIKE ?", "%" + userId + "%");

        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);

        Order order = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 1)), null))
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

    /** 发货落包裹：同事务写入，状态待揽收，承运商名与运单号是发货时刻快照 */
    private UUID shipAndGetShipmentId(UUID orderId) {
        orderTransitionService.ship(
                shopId,
                orderId,
                new ShipOrderRequest("顺丰速运", "SF" + orderId.toString().substring(0, 12)));
        UUID shipmentId = jdbc.queryForObject(
                "SELECT id FROM logistics.shipments WHERE order_id = ?::uuid", UUID.class, orderId.toString());
        assertNotNull(shipmentId, "发货必须落出包裹");
        return shipmentId;
    }

    @Test
    void 发货落包裹_轨迹逐节点推进状态_重推与乱序不改终态() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = shipAndGetShipmentId(orderId);

        // 1. 发货即落包裹：待揽收，承运商名/运单号/发货时刻都是发货那一刻的快照
        ShipmentTracking afterShip = shipmentService.trackingOfOrder(userId, orderId);
        assertEquals(ShipmentStatus.PENDING_PICKUP, afterShip.shipment().getStatus());
        assertEquals("顺丰速运", afterShip.shipment().getCarrierName());
        assertTrue(afterShip.shipment().getTrackingNo().startsWith("SF"));
        assertNotNull(afterShip.shipment().getShippedAt());
        assertNull(afterShip.shipment().getDeliveredAt());
        assertEquals(0, afterShip.nodes().size(), "不发假节点：揽收前没有承运商事实");

        // 2. 节点按事实推进状态：揽收 → 到达分拨（运输中）→ 派送中
        OffsetDateTime base = OffsetDateTime.now().minusHours(6);
        recordNode(shipmentId, TrackingNodeCode.PICKED_UP, base, "杭州西湖网点");
        assertEquals(ShipmentStatus.PICKED_UP, statusOf(shipmentId));
        recordNode(shipmentId, TrackingNodeCode.ARRIVED_HUB, base.plusHours(2), "杭州转运中心");
        assertEquals(ShipmentStatus.IN_TRANSIT, statusOf(shipmentId));
        recordNode(shipmentId, TrackingNodeCode.OUT_FOR_DELIVERY, base.plusHours(5), "上海浦东网点");
        assertEquals(ShipmentStatus.DELIVERING, statusOf(shipmentId));

        // 3. 签收：状态到终态并回填签收时刻
        //    时刻截到毫秒：PG 的 timestamptz 是微秒精度且会四舍五入，纳秒值写进去读回来必然差 1μs
        OffsetDateTime deliveredAt = base.plusHours(6).truncatedTo(ChronoUnit.MILLIS);
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        assertEquals(ShipmentStatus.DELIVERED, statusOf(shipmentId));
        assertEquals(
                deliveredAt.toInstant(),
                jdbc.queryForObject(
                                "SELECT delivered_at FROM logistics.shipments WHERE id = ?::uuid",
                                Timestamp.class,
                                shipmentId.toString())
                        .toInstant());

        // 4. 重推：同节点码 + 同时刻 + 同地点再录一遍，行数不变、状态不变（去重靠业务唯一键，不靠推送方 message id）
        int before = nodeCountOf(shipmentId);
        recordNode(shipmentId, TrackingNodeCode.DELIVERED, deliveredAt, "上海浦东网点");
        assertEquals(before, nodeCountOf(shipmentId));

        // 5. 乱序/迟到：签收后才到的中转节点照样落库供人看，但不允许把状态倒回运输中
        recordNode(shipmentId, TrackingNodeCode.DEPARTED_HUB, base.plusHours(3), "杭州转运中心");
        assertEquals(before + 1, nodeCountOf(shipmentId));
        assertEquals(ShipmentStatus.DELIVERED, statusOf(shipmentId));

        // 6. 轨迹按时序返回：迟到补推的节点按事件时刻插回原位
        List<TrackingNodeCode> codes = shipmentService.trackingOfOrder(userId, orderId).nodes().stream()
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
    void 异常节点_可被后续前向节点离开_不会永久卡死() {
        UUID orderId = seedPaidOrder();
        UUID shipmentId = shipAndGetShipmentId(orderId);

        OffsetDateTime base = OffsetDateTime.now().minusHours(4);
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

        shipAndGetShipmentId(orderId);

        // 越权：别人的订单，同一个 404 与同一句话术——不泄露单据存在性
        BusinessException notMine = assertThrows(
                BusinessException.class, () -> shipmentService.trackingOfOrder(UUID.randomUUID(), orderId));
        assertEquals(404, notMine.getHttpStatus());
        assertEquals(notShipped.getMessage(), notMine.getMessage());

        // 本人可读
        assertEquals(
                orderId,
                shipmentService.trackingOfOrder(userId, orderId).shipment().getOrderId());
    }

    private ShipmentStatus statusOf(UUID shipmentId) {
        return jdbc.queryForObject(
                "SELECT status FROM logistics.shipments WHERE id = ?::uuid",
                ShipmentStatus.class,
                shipmentId.toString());
    }
}
