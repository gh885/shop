package com.shop.platform.aftersale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

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

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID orderId;

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
        skuId = db.seedOnSaleSku(shopId, 1000, 5);
        UUID addressId = db.seedAddress(userId);
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

    private int eventCount() {
        return jdbc.queryForObject(
                "SELECT count(*) FROM aftersale.ticket_events e JOIN aftersale.tickets t ON t.id = e.ticket_id WHERE t.order_id = ?::uuid",
                Integer.class,
                orderId.toString());
    }

    @Test
    void 退货退款全链路_同意后未退款_回寄后收货退款并回补库存() {
        // 申请退货退款 → APPLYING；订单投影同步；时间线一条
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, "质量不行");
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus());
        assertEquals("APPLYING", orderProjection());
        assertEquals(1, eventCount());

        // 同一订单不能再开一张进行中的单
        BusinessException dup = assertThrows(
                BusinessException.class, () -> afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, null));
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
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, null);
        afterSale.agree(shopId, orderId);

        assertEquals(TicketStatus.REFUNDED.name(), ticketStatus());
        assertEquals("REFUNDED", orderProjection());
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus());
        assertEquals(3, totalStock()); // 货不退，库存不动
    }

    @Test
    void 卖家工作台列表_带订单摘要_按状态筛选且不串店() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, "质量不行");

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
                                () -> afterSale.apply(UUID.randomUUID(), orderId, TicketType.REFUND_ONLY, null))
                        .getHttpStatus());
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, null);
        assertEquals(
                404,
                assertThrows(BusinessException.class, () -> afterSale.reject(UUID.randomUUID(), orderId))
                        .getHttpStatus());
    }
}
