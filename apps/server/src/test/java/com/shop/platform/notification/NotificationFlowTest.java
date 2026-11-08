package com.shop.platform.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.common.money.Money;
import com.shop.platform.fulfillment.events.ShipmentRecorded;
import com.shop.platform.governance.events.SellerResumed;
import com.shop.platform.governance.events.SellerSuspended;
import com.shop.platform.notification.dto.NotificationDtos.NotificationPage;
import com.shop.platform.notification.dto.NotificationDtos.NotificationView;
import com.shop.platform.notification.mapper.NotificationMapper;
import com.shop.platform.notification.mapper.NotificationMapper.NewMessage;
import com.shop.platform.notification.service.NotificationQueryService;
import com.shop.platform.notification.service.NotificationService;
import com.shop.platform.payment.events.RefundSucceeded;
import com.shop.platform.testsupport.IntegrationTest;
import com.shop.platform.trade.events.OrderCompleted;
import com.shop.platform.trade.events.SellerOrderPlaced;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 事件 → 消息 → 已读 的整条链。
 *
 * <p>全部走真链路：事务内发布 → outbox 登记 → Modulith 异步派发 → inbox 抢占 → 落库，
 * 与 {@code OutboxTest} 同一姿势。监听器方法带 @Async，直调代理只会把活儿甩到 task 线程
 * 而测试先断言——所以这里不直调，发事件后 Awaitility 等行。
 */
class NotificationFlowTest extends IntegrationTest {

    private static final UUID BUYER = Ids.newId();
    private static final UUID OTHER_BUYER = Ids.newId();
    private static final UUID MERCHANT = Ids.newId();
    private static final UUID ORDER_GROUP = Ids.newId();
    private static final UUID SELLER_ORDER = Ids.newId();

    @Autowired
    private NotificationQueryService queries;

    @Autowired
    private NotificationService service;

    @Autowired
    private NotificationMapper messages;

    @Autowired
    private ApplicationEventPublisher publisher;

    @Autowired
    private PlatformTransactionManager transactionManager;

    /** 事务内发布（AFTER_COMMIT 派发的必要条件），行数到位再继续断言。 */
    private void send(Object event, int expectedRows) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> publisher.publishEvent(event));
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(totalRows()).isEqualTo(expectedRows));
    }

    private long totalRows() {
        return jdbc.queryForObject("SELECT count(*) FROM notification.message", Long.class);
    }

    /** 不经过事件链的准备数据（翻页用例只关心读路径）。 */
    private void inTx(Runnable body) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> body.run());
    }

    // ── 事件矩阵 ─────────────────────────────────────────────────────────────

    @Test
    void 六个事件各落一条给对收件人的消息() {
        send(
                new SellerOrderPlaced(
                        Ids.newId(),
                        ORDER_GROUP,
                        SELLER_ORDER,
                        MERCHANT,
                        List.of(new SellerOrderPlaced.Line(1, Ids.newId(), 2, 5000, 500, 4500)),
                        5000,
                        800,
                        500,
                        Instant.now()),
                1);
        send(
                new ShipmentRecorded(
                        Ids.newId(),
                        SELLER_ORDER,
                        ORDER_GROUP,
                        MERCHANT,
                        Ids.newId(),
                        Ids.newId(),
                        "PKG20261108000001",
                        "sf",
                        "SF123456789",
                        BUYER,
                        Instant.now()),
                2);
        send(
                new RefundSucceeded(
                        Ids.newId(),
                        Ids.newId(),
                        Ids.newId(),
                        ORDER_GROUP,
                        SELLER_ORDER,
                        BUYER,
                        new Money(2500, "CNY"),
                        Ids.newId().toString(),
                        Instant.now()),
                3);
        send(new OrderCompleted(Ids.newId(), ORDER_GROUP, BUYER, List.of(SELLER_ORDER), Instant.now()), 4);
        send(new SellerSuspended(Ids.newId(), MERCHANT, "刷单扣分", Ids.newId(), Instant.now()), 5);
        send(new SellerResumed(Ids.newId(), MERCHANT, "整改验收通过", Ids.newId(), Instant.now()), 6);

        NotificationPage buyerPage = queries.forBuyer(BUYER, null, 20);
        assertThat(buyerPage.items())
                .extracting(NotificationView::type)
                .containsExactlyInAnyOrder("shipment_recorded", "refund_succeeded", "order_completed");

        NotificationView shipment = byType(buyerPage, "shipment_recorded");
        assertThat(shipment.params())
                .containsEntry("orderGroupId", ORDER_GROUP.toString())
                .containsEntry("carrierCode", "sf")
                .containsEntry("trackingNo", "SF123456789");
        assertThat(shipment.link()).isEqualTo("/orders/" + ORDER_GROUP);
        assertThat(shipment.readAt()).isNull();

        NotificationView refund = byType(buyerPage, "refund_succeeded");
        assertThat(refund.params())
                .containsEntry("orderGroupId", ORDER_GROUP.toString())
                .containsEntry("amount", 2500)
                .containsEntry("currency", "CNY");
        assertThat(refund.link()).isEqualTo("/orders/" + ORDER_GROUP);

        assertThat(byType(buyerPage, "order_completed").link()).isEqualTo("/account/reviews?tab=pending");

        NotificationPage merchantPage = queries.forMerchant(MERCHANT, null, 20);
        assertThat(merchantPage.items())
                .extracting(NotificationView::type)
                .containsExactlyInAnyOrder("order_placed", "seller_suspended", "seller_resumed");
        assertThat(byType(merchantPage, "order_placed").params())
                .containsEntry("orderGroupId", ORDER_GROUP.toString())
                .containsEntry("sellerOrderId", SELLER_ORDER.toString());
        assertThat(byType(merchantPage, "seller_suspended").params()).containsEntry("reason", "刷单扣分");
        assertThat(byType(merchantPage, "order_placed").link()).isNull();
    }

    @Test
    void 买家与商家的消息互相不可见() {
        send(shipmentTo(BUYER), 1);
        send(new SellerSuspended(Ids.newId(), MERCHANT, "刷单扣分", Ids.newId(), Instant.now()), 2);

        assertThat(queries.forBuyer(BUYER, null, 20).items()).hasSize(1);
        assertThat(queries.forBuyer(OTHER_BUYER, null, 20).items()).isEmpty();
        assertThat(queries.forMerchant(MERCHANT, null, 20).items()).hasSize(1);
        assertThat(queries.unreadCountForBuyer(BUYER)).isEqualTo(1);
        assertThat(queries.unreadCountForBuyer(OTHER_BUYER)).isZero();
    }

    // ── 幂等 ─────────────────────────────────────────────────────────────────

    @Test
    void 同一条事件重投不产生第二条() {
        ShipmentRecorded event = shipmentTo(BUYER);
        // 同一事件登记两次 outbox：派发两遍，inbox 把第二遍挡掉
        send(event, 1);
        send(event, 1);

        assertThat(queries.forBuyer(BUYER, null, 20).items()).hasSize(1);
    }

    // ── 已读 ─────────────────────────────────────────────────────────────────

    @Test
    void 标已读幂等且别人的消息是404() {
        send(shipmentTo(BUYER), 1);
        UUID id = queries.forBuyer(BUYER, null, 20).items().getFirst().id();

        service.markReadForBuyer(id, BUYER);
        // 幂等：已读过再来一次不报错
        service.markReadForBuyer(id, BUYER);
        assertThat(queries.unreadCountForBuyer(BUYER)).isZero();
        assertThat(queries.forBuyer(BUYER, null, 20).items().getFirst().readAt())
                .isNotNull();

        // 别人的消息：CAS 0 行且重读为空 → 404，不暴露存在性
        assertThatThrownBy(() -> service.markReadForBuyer(id, OTHER_BUYER)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.markReadForBuyer(Ids.newId(), BUYER)).isInstanceOf(BusinessException.class);
    }

    @Test
    void 全部已读一次清空且可重复() {
        send(shipmentTo(BUYER), 1);
        send(shipmentTo(BUYER), 2);
        send(shipmentTo(BUYER), 3);
        assertThat(queries.unreadCountForBuyer(BUYER)).isEqualTo(3);

        service.markAllReadForBuyer(BUYER);
        service.markAllReadForBuyer(BUYER);
        assertThat(queries.unreadCountForBuyer(BUYER)).isZero();
        assertThat(queries.forBuyer(BUYER, null, 20).items()).hasSize(3);
    }

    @Test
    void 商家侧已读与买家侧同规矩() {
        send(new SellerSuspended(Ids.newId(), MERCHANT, "刷单扣分", Ids.newId(), Instant.now()), 1);
        UUID id = queries.forMerchant(MERCHANT, null, 20).items().getFirst().id();

        service.markReadForMerchant(id, MERCHANT);
        assertThat(queries.unreadCountForMerchant(MERCHANT)).isZero();
        assertThatThrownBy(() -> service.markReadForMerchant(id, Ids.newId())).isInstanceOf(BusinessException.class);
    }

    // ── 翻页 ─────────────────────────────────────────────────────────────────

    @Test
    void 游标翻页到没有更多() {
        inTx(() -> {
            for (int i = 0; i < 5; i++) {
                messages.insert(new NewMessage("buyer", BUYER, null, "order_completed", "{}", null));
            }
        });

        NotificationPage first = queries.forBuyer(BUYER, null, 2);
        assertThat(first.items()).hasSize(2);
        assertThat(first.nextCursor()).isNotNull();

        NotificationPage second = queries.forBuyer(BUYER, first.nextCursor(), 2);
        assertThat(second.items()).hasSize(2);
        assertThat(second.nextCursor()).isNotNull();

        NotificationPage third = queries.forBuyer(BUYER, second.nextCursor(), 2);
        assertThat(third.items()).hasSize(1);
        assertThat(third.nextCursor()).isNull();

        // 三页拼起来恰好五条不重不漏
        List<UUID> ids = java.util.stream.Stream.of(first, second, third)
                .flatMap(p -> p.items().stream())
                .map(NotificationView::id)
                .toList();
        assertThat(ids).hasSize(5).doesNotHaveDuplicates();
    }

    // ── 参数边界 ─────────────────────────────────────────────────────────────

    @Test
    void params落库是对象形状的jsonb() {
        send(
                new RefundSucceeded(
                        Ids.newId(),
                        Ids.newId(),
                        Ids.newId(),
                        ORDER_GROUP,
                        SELLER_ORDER,
                        BUYER,
                        new Money(1, "CNY"),
                        "case",
                        Instant.now()),
                1);

        Map<String, Object> row =
                jdbc.queryForMap("SELECT params::text AS params FROM notification.message WHERE buyer_id = ?", BUYER);
        assertThat(String.valueOf(row.get("params")).replace(" ", ""))
                .as("params 必须是 jsonb object，模板插值才有的取（jsonb::text 带空格，比对前去掉）")
                .startsWith("{")
                .endsWith("}")
                .contains("\"amount\":1")
                .contains("\"currency\":\"CNY\"");
    }

    private static NotificationView byType(NotificationPage page, String type) {
        return page.items().stream()
                .filter(item -> item.type().equals(type))
                .findFirst()
                .orElseThrow(() -> new AssertionError("没有 type=" + type + " 的消息"));
    }

    private static ShipmentRecorded shipmentTo(UUID buyerId) {
        return new ShipmentRecorded(
                Ids.newId(),
                SELLER_ORDER,
                ORDER_GROUP,
                MERCHANT,
                Ids.newId(),
                Ids.newId(),
                "PKG20261108000002",
                "sf",
                "SF987654321",
                buyerId,
                Instant.now());
    }
}
