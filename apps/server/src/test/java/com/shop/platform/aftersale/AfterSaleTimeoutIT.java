package com.shop.platform.aftersale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.aftersale.service.AfterSaleService;
import com.shop.platform.aftersale.service.AfterSaleTimeoutService;
import com.shop.platform.logistics.service.DispatchShipmentCommand;
import com.shop.platform.logistics.service.ShipmentService;
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
 * 售后超时 Closer（C11）集成验证（真库）：三条超时线各自「到期落成 / 未到期不动 / 条件不满足让位」。
 *
 * <p>时间推进用 SQL 回拨 created_at / 时间线事件时刻，而不是把窗口常量改小：扫的就是生产同一条判定
 * （APPLYING 看单行 created_at，RETURNING 两条线看同意 / 回寄事件时刻 + 是否登记过运单号），
 * 常量改小测的是另一个系统。
 * 断言吃「这笔单的最终状态」而不是 sweep 返回值——测试库共享，别的用例会混进同一批扫描。
 */
@SpringBootTest
class AfterSaleTimeoutIT extends IntegrationTestSupport {

    @Autowired
    private OrderService orderService;

    @Autowired
    private PaymentService paymentService;

    @Autowired
    private OrderTransitionService transitions;

    /** 发货已归一为物流动作：走完履约闭环需要它 */
    @Autowired
    private ShipmentService shipmentService;

    @Autowired
    private AfterSaleService afterSale;

    @Autowired
    private AfterSaleTimeoutService timeoutService;

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private UUID skuId;

    private UUID orderId;

    @BeforeEach
    void seed() {
        db.onDelete("DELETE FROM payment.payments WHERE user_id = ?::uuid", userId.toString());
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
        UUID addressId = db.seedAddress(userId);
        db.seedShipAddress(shopId);

        // 走到履约闭环（COMPLETED）：售后申请窗口的起点
        Order created = orderService
                .create(
                        userId,
                        new CreateOrderRequest(
                                UUID.randomUUID(), addressId, List.of(new OrderLineRequest(skuId, 2)), null, null))
                .getFirst();
        orderId = created.getId();
        paymentService.confirm(userId, paymentService.pay(userId, orderId).getId());
        shipmentService.dispatch(new DispatchShipmentCommand(shopId, orderId, "SF", "SF111"));
        transitions.receive(userId, orderId);
    }

    /** 造一个真实 ACTIVE 买家账号：手机号按 uuid 派生避免并发跑撞唯一索引（与 coupon 测试同一写法） */
    private void seedActiveUser() {
        jdbc.update(
                "INSERT INTO account.users (id, phone, status) VALUES (?::uuid, ?, 'ACTIVE')",
                userId.toString(),
                "139" + Math.abs(userId.getMostSignificantBits() % 100_000_000L));
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

    /** 时间线上最后一条动作（actor|action|note）：验证「超时动作记的是 SYSTEM，不冒充卖家点了按钮」 */
    private List<String> latestEvents(String action) {
        return jdbc.queryForList(
                """
                SELECT e.actor || '|' || e.action || '|' || COALESCE(e.note, '')
                FROM aftersale.ticket_events e
                JOIN aftersale.tickets t ON t.id = e.ticket_id
                WHERE t.order_id = ?::uuid AND e.action = ?
                """,
                String.class,
                orderId.toString(),
                action);
    }

    /** 库存余量：超时确认收货的回补副作用要与人工同落点，这里数得出来（下单扣 2，回补后回到 5） */
    private int totalStock() {
        return jdbc.queryForObject(
                "SELECT stock FROM inventory.sku_stock WHERE sku_id = ?::uuid", Integer.class, skuId.toString());
    }

    /** 把售后单出生时刻回拨（= APPLYING 已停留 n 小时）：扫描判定吃的是 created_at，见 TicketMapper 注释 */
    private void ageTicketHours(int hours) {
        jdbc.update(
                "UPDATE aftersale.tickets SET created_at = created_at - make_interval(hours => ?) WHERE order_id = ?::uuid",
                hours,
                orderId.toString());
    }

    /**
     * 把「买家寄回」的时刻回拨 n 天（时间线里的 RETURN_GOODS 事件）：确认收货线的入态时钟。
     * 只回拨事件、不回拨 tickets.created_at——那会让同一条单同时满足卖家审核超时，测的不是这一步。
     */
    private void ageReturnGoodsEventDays(int days) {
        jdbc.update(
                """
                UPDATE aftersale.ticket_events SET created_at = created_at - make_interval(days => ?)
                WHERE action = 'RETURN_GOODS'
                  AND ticket_id IN (SELECT id FROM aftersale.tickets WHERE order_id = ?::uuid)
                """,
                days,
                orderId.toString());
    }

    /** 把「进入 RETURNING」的时刻（同意动作落时间线）回拨 n 天：RETURNING 线的入态时钟就是这条事件 */
    private void ageAgreeReturnEventDays(int days) {
        jdbc.update(
                """
                UPDATE aftersale.ticket_events SET created_at = created_at - make_interval(days => ?)
                WHERE action IN ('AGREE_RETURN', 'AUTO_AGREE_RETURN')
                  AND ticket_id IN (SELECT id FROM aftersale.tickets WHERE order_id = ?::uuid)
                """,
                days,
                orderId.toString());
    }

    @Test
    void 超时自动同意_仅退款_卖家48小时未处理_到期转已退款并记系统动作() {
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, "不想要了");
        ageTicketHours(49);

        assertTrue(timeoutService.sweepSellerResponse() >= 1);
        assertEquals(TicketStatus.REFUNDED.name(), ticketStatus());
        assertEquals("REFUNDED", orderProjection());
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus(), "自动同意走的是与手动同意同款的退款副作用");
        assertEquals(List.of("SYSTEM|AUTO_REFUND|卖家超时未处理，系统自动同意"), latestEvents("AUTO_REFUND"));
    }

    @Test
    void 超时自动同意_退货退款_到期只进退货流程_退款等收货() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, "质量不行");
        ageTicketHours(49);

        assertTrue(timeoutService.sweepSellerResponse() >= 1);
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus(), "此时还没退款：货没回来");

        // 自动同意产生的 RETURNING 同样挂上 7 天回寄时钟：到期未回寄 → 自动关闭
        ageAgreeReturnEventDays(8);
        assertTrue(timeoutService.sweepReturnShip() >= 1);
        assertEquals(TicketStatus.CLOSED.name(), ticketStatus());
        assertEquals("CLOSED", orderProjection(), "联动释放：订单投影同步为终态");
    }

    @Test
    void 超时自动同意_未满48小时_不动() {
        afterSale.apply(userId, orderId, TicketType.REFUND_ONLY, null);
        ageTicketHours(47);

        timeoutService.sweepSellerResponse();
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus());
    }

    @Test
    void 超时自动同意_卖家已抢先处理_定时器不重复动作() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        ageTicketHours(999); // 就算回拨到远古，状态已不在 APPLYING，扫描集里没有它

        timeoutService.sweepSellerResponse();
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
        assertEquals(List.of(), latestEvents("AUTO_AGREE_RETURN"));
    }

    @Test
    void 悬挂回寄_到期未填运单号_自动关闭并释放进行中名额() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        ageAgreeReturnEventDays(8);

        assertTrue(timeoutService.sweepReturnShip() >= 1);
        assertEquals(TicketStatus.CLOSED.name(), ticketStatus());
        assertEquals("CLOSED", orderProjection());
        assertEquals(List.of("SYSTEM|AUTO_CLOSE|买家超时未回寄，系统自动关闭"), latestEvents("AUTO_CLOSE"));

        // 名额释放：同单可以再开一张（进行中唯一索引让位，申请窗口未过）
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, "换个理由再来");
        assertEquals(TicketStatus.APPLYING.name(), ticketStatus());
    }

    @Test
    void 悬挂回寄_已填回寄运单号_到期也不关_货在途等卖家收货() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        ageAgreeReturnEventDays(8);

        timeoutService.sweepReturnShip();
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
    }

    @Test
    void 悬挂回寄_未满7天_不动() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        ageAgreeReturnEventDays(6);

        timeoutService.sweepReturnShip();
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
    }

    // 卖家确认收货超时（AFS-23 第③条）：买家已寄回，卖家的沉默不能悬着钱和订单
    @Test
    void 已回寄_卖家超10天未确认收货_自动退款回补并记系统动作() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, "质量不行");
        afterSale.agree(shopId, orderId);
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        assertEquals(3, totalStock());
        ageReturnGoodsEventDays(11);

        assertTrue(timeoutService.sweepReturnReceive() >= 1);
        assertEquals(TicketStatus.REFUNDED.name(), ticketStatus());
        assertEquals("REFUNDED", orderProjection());
        assertEquals(PaymentStatus.REFUNDED.name(), paymentStatus(), "自动确认收货退的是同一条退款落点");
        assertEquals(5, totalStock(), "货已寄回，回补与人工确认收货同口径");
        assertEquals(List.of("SYSTEM|AUTO_RECEIVE|卖家超时未确认收货，系统自动退款"), latestEvents("AUTO_RECEIVE"));
    }

    @Test
    void 已回寄_未满10天_不动() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        ageReturnGoodsEventDays(9);

        timeoutService.sweepReturnReceive();
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
        assertEquals(PaymentStatus.SUCCESS.name(), paymentStatus());
    }

    @Test
    void 改过运单号_从最后一次寄出重新起算_不被老事件提前判死() {
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        afterSale.returnGoods(userId, orderId, "ZTO", "中通快递", "ZT999");
        ageReturnGoodsEventDays(11); // 第一次寄出已在 11 天前（填错单号、快递退回的场景）
        afterSale.returnGoods(userId, orderId, "SF", "顺丰快递", "SF888"); // 重新寄出，时钟该从这里再起

        timeoutService.sweepReturnReceive();
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus());
    }

    @Test
    void 两条退货超时线互斥_未寄回归自动关闭_已寄回归自动退款() {
        // 未填运单号：确认收货扫描不该碰它（货根本没在路上）
        afterSale.apply(userId, orderId, TicketType.RETURN_REFUND, null);
        afterSale.agree(shopId, orderId);
        ageAgreeReturnEventDays(30);
        ageTicketHours(30 * 24);

        timeoutService.sweepReturnReceive();
        assertEquals(TicketStatus.RETURNING.name(), ticketStatus(), "确认收货线认的是「已寄回」，此单不入库");

        assertTrue(timeoutService.sweepReturnShip() >= 1, "它归自动关闭管");
        assertEquals(TicketStatus.CLOSED.name(), ticketStatus());
    }
}
