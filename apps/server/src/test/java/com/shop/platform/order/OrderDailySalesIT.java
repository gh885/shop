package com.shop.platform.order;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.Money;
import com.shop.platform.order.service.DailySalesView;
import com.shop.platform.order.service.OrderService;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 近 30 天每日销售额聚合的真库验证：mapper 的按营业日切档 + service 的补零窗口，端到端跑通。
 *
 * <p>盯三件裸 SQL 最容易翻车的事：① 只认已成交状态（待付款/付款后取消都不进营收）；② 按平台时区切营业日
 * （{@code paid_at AT TIME ZONE 'Asia/Shanghai'}），窗口外的旧单被 {@code since} 挡在门外；③ 出参恒 Money。
 * 走真库而非 mock，因为 {@code to_char}/{@code AT TIME ZONE}/{@code GROUP BY 1,2}/sum→numeric 的返回类型
 * 只有真 Postgres 能给答案。
 *
 * <p>子订单已无待付款态：「没付」用主订单 PENDING_PAYMENT + 子订单 paid_at 为空表达。
 */
@SpringBootTest
class OrderDailySalesIT extends IntegrationTestSupport {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired
    private OrderService orderService;

    private final UUID shopId = UUID.randomUUID();

    private final UUID userId = UUID.randomUUID();

    private final LocalDate today = LocalDate.now(BUSINESS_ZONE);

    /** 结果按营业日索引，断言不依赖补零序列的下标位置 */
    private Map<LocalDate, Money> byDay(List<DailySalesView> series) {
        return series.stream().collect(Collectors.toMap(DailySalesView::date, DailySalesView::amount));
    }

    /**
     * 直插一张主订单 + 一张子订单。传 {@code PENDING_PAYMENT} 表示「没付」：主订单待支付、子订单 paid_at 为空；
     * 其余状态表示已付过款（paid_at 回填），子订单状态用入参。
     */
    private void insert(String orderStatus, long payAmount, LocalDate paidDay) {
        UUID orderId = UUID.randomUUID();
        UUID tradeId = UUID.randomUUID();
        boolean unpaid = "PENDING_PAYMENT".equals(orderStatus);
        OffsetDateTime paidAt = paidDay == null || unpaid
                ? null
                : ZonedDateTime.of(paidDay, LocalTime.NOON, BUSINESS_ZONE).toOffsetDateTime();
        String childStatus = unpaid ? "PAID" : orderStatus;
        String tradeStatus = unpaid ? "PENDING_PAYMENT" : "PAID";

        jdbc.update(
                """
                INSERT INTO orders.trades
                    (id, trade_no, user_id, status, item_amount, shipping_fee, discount_amount, pay_amount,
                     paid_amount, refunded_amount, compensated_amount, currency,
                     receiver_name, receiver_phone, receiver_region_code, receiver_province, receiver_city,
                     receiver_district, receiver_detail, pay_expire_at, paid_at, checkout_key)
                VALUES (?::uuid, ?, ?::uuid, ?, ?, 0, 0, ?, ?, 0, 0, 'CNY',
                        '张三', '13800000000', '110105', '北京市', '北京市', '朝阳区',
                        '测试路 1 号', ?, ?, ?::uuid)
                """,
                tradeId.toString(),
                tradeId.toString().replace("-", ""),
                userId.toString(),
                tradeStatus,
                payAmount,
                payAmount,
                unpaid ? 0L : payAmount,
                OffsetDateTime.now().plusDays(1),
                paidAt,
                UUID.randomUUID().toString());

        jdbc.update(
                """
                INSERT INTO orders.orders
                    (id, order_no, trade_id, user_id, shop_id, status, item_amount, shipping_fee,
                     discount_amount, pay_amount, currency, paid_at)
                VALUES (?::uuid, ?, ?::uuid, ?::uuid, ?::uuid, ?, ?, 0, 0, ?, 'CNY', ?)
                """,
                orderId.toString(),
                orderId.toString().replace("-", ""), // order_no VARCHAR(32)：去连字符的 UUID 正好 32 字符且唯一
                tradeId.toString(),
                userId.toString(),
                shopId.toString(),
                childStatus,
                payAmount,
                payAmount,
                paidAt);
    }

    private void givenSalesInWindow() {
        db.onDelete("DELETE FROM orders.trades WHERE user_id = ?::uuid", userId.toString());
        db.onDelete("DELETE FROM orders.orders WHERE shop_id = ?::uuid", shopId.toString());
    }

    @Test
    void 补满30天_空档日补零且金额是Money() {
        givenSalesInWindow();
        insert("PAID", 2000L, today);
        insert("COMPLETED", 3000L, today);
        insert("SHIPPED", 1500L, today.minusDays(5));

        List<DailySalesView> series = orderService.sellerDailySales(shopId);

        assertThat(series).hasSize(30);
        assertThat(series.getFirst().date()).isEqualTo(today.minusDays(29));
        assertThat(series.getLast().date()).isEqualTo(today);

        Map<LocalDate, Money> byDay = byDay(series);
        assertThat(byDay.get(today)).isEqualTo(Money.cny(5000));
        assertThat(byDay.get(today.minusDays(5))).isEqualTo(Money.cny(1500));
        // 无成交日补的是「有币种的零」（CNY），不是 null 也不是裸 0
        assertThat(byDay.get(today.minusDays(1))).isEqualTo(Money.zero(Money.CNY));
        byDay.values().forEach(money -> assertThat(money.currency()).isEqualTo("CNY"));
    }

    @Test
    void 只认已成交_待付款与付款后取消不计营收() {
        givenSalesInWindow();
        insert("PENDING_PAYMENT", 9999L, today); // 没付，不算
        insert("CANCELLED", 8888L, today); // 付款后取消（带 paid_at），已退款不算
        insert("PAID", 1200L, today); // 唯一进营收的一笔

        Map<LocalDate, Money> byDay = byDay(orderService.sellerDailySales(shopId));

        assertThat(byDay.get(today)).isEqualTo(Money.cny(1200));
    }

    @Test
    void 窗口外的旧单不进批() {
        givenSalesInWindow();
        insert("PAID", 7777L, today.minusDays(40)); // 已成交，但在 30 天窗口之外

        List<DailySalesView> series = orderService.sellerDailySales(shopId);

        assertThat(series).hasSize(30).allSatisfy(day -> assertThat(day.amount().amount())
                .isZero());
    }
}
