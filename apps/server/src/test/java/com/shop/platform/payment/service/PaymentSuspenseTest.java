package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.id.Ids;
import com.shop.platform.payment.api.PaymentCommand;
import com.shop.platform.payment.api.PaymentView;
import com.shop.platform.payment.mapper.SuspenseMapper;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * "钱到了但推进不了"的三条挂账路径（迟到回调 / 金额不符 / 退款销账），加上支付单
 * 有效期锚点：不比订单可付窗口活得久，已过期的 pending 不再复用。
 *
 * <p>不用 @Transactional：RefundSucceeded 的监听器是 AFTER_COMMIT + 异步的，
 * 事务里等不到它。
 */
@SpringBootTest
@ActiveProfiles("test")
class PaymentSuspenseTest {

    private static final String CNY = "CNY";

    @Autowired
    private PaymentService payments;

    @Autowired
    private SuspenseService suspense;

    @Autowired
    private SuspenseMapper suspenseStore;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void 支付单有效期锚到订单可付期限_且上限三十分钟() {
        UUID groupId = Ids.newId();
        UUID buyer = Ids.newId();

        // 订单可付期限只剩 10 分钟：支付单跟着死在第 15 分钟（expiresAt + 5 分钟宽限）
        Instant deadline = Instant.now().plusSeconds(600);
        PaymentView anchored = payments.create(groupId, buyer, 10_000, CNY, deadline);
        assertThat(anchored.expiresAt())
                .isAfter(Instant.now().plusSeconds(550))
                .isBefore(Instant.now().plusSeconds(650));

        // 订单还早着：支付单按自身 TTL 封顶 30 分钟，而不是跟着订单活
        PaymentView capped =
                payments.create(Ids.newId(), buyer, 10_000, CNY, Instant.now().plusSeconds(7_200));
        assertThat(capped.expiresAt())
                .isAfter(Instant.now().plusSeconds(1_700))
                .isBefore(Instant.now().plusSeconds(1_900));

        // 可付时间已过的订单：不再发支付单（正常入口被 payableNow 挡着，这里是最后防线）
        assertThatThrownBy(() -> payments.create(
                        Ids.newId(), buyer, 10_000, CNY, Instant.now().minusSeconds(60)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));
    }

    @Test
    void 已过期的pending支付单不复用_重新发一张() {
        UUID groupId = Ids.newId();
        UUID buyer = Ids.newId();
        PaymentView first =
                payments.create(groupId, buyer, 10_000, CNY, Instant.now().plusSeconds(3_600));

        // 关单任务还没扫到的过期 pending：是张死票，不该再递给用户
        jdbc.update(
                "UPDATE payment.payment_order SET expires_at = now() - interval '1 minute' WHERE id = ?",
                first.paymentId());

        PaymentView second =
                payments.create(groupId, buyer, 10_000, CNY, Instant.now().plusSeconds(3_600));
        assertThat(second.paymentId()).isNotEqualTo(first.paymentId());
        assertThat(second.expiresAt()).isAfter(Instant.now());
    }

    @Test
    void 迟到成功回调_挂账留痕_回执可读() {
        UUID paymentId = insertPayment("closed", 10_000);

        PaymentCommand.Confirmation confirmation = payments.handleCallback(callbackOf(paymentId, 10_000));

        assertThat(confirmation.paid()).isTrue();
        assertThat(confirmation.applied()).isFalse();
        assertThat(confirmation.message()).contains("挂账");

        SuspenseMapper.SuspenseRow row = requireSuspense(paymentId);
        assertThat(row.reason()).isEqualTo(com.shop.platform.payment.api.SuspenseReason.LATE_CALLBACK);
        assertThat(row.amount()).isEqualTo(10_000);
        assertThat(row.status()).isEqualTo("open");
        assertThat(row.channelTxnId()).startsWith("MOCK");
    }

    @Test
    void 已成功的重复回调_不重复挂账() {
        UUID paymentId = insertPayment("success", 10_000);

        PaymentCommand.Confirmation confirmation = payments.handleCallback(callbackOf(paymentId, 10_000));

        assertThat(confirmation.paid()).isTrue();
        assertThat(confirmation.message()).contains("重复回调");
        assertThat(suspenseRowIdOf(paymentId)).isNull();
    }

    @Test
    void 金额不符_支付单置成功_挂账金额按实收() {
        UUID paymentId = insertPayment("pending", 10_000);

        PaymentCommand.Confirmation confirmation = payments.handleCallback(callbackOf(paymentId, 9_999));

        // 支付单承认钱到了（amountMatched=false），挂账挂的是实收 9999，不是应付 10000
        assertThat(confirmation.message()).contains("金额不符");
        Boolean amountMatched = jdbc.queryForObject(
                "SELECT amount_matched FROM payment.payment_order WHERE id = ?", Boolean.class, paymentId);
        assertThat(amountMatched).isFalse();

        SuspenseMapper.SuspenseRow row = requireSuspense(paymentId);
        assertThat(row.reason()).isEqualTo(com.shop.platform.payment.api.SuspenseReason.AMOUNT_MISMATCH);
        assertThat(row.amount()).isEqualTo(9_999);
    }

    @Test
    void 挂账退款_渠道受理_自动销账_重复点不退两次() throws Exception {
        UUID paymentId = insertPayment("closed", 10_000);
        payments.handleCallback(callbackOf(paymentId, 10_000));
        UUID suspenseId = requireSuspense(paymentId).id();

        PaymentCommand.Refund first = suspense.refund(suspenseId);
        assertThat(first.success()).isTrue();

        // 销账由 RefundSucceeded 监听器异步落：钱真的出去了才销
        awaitResolved(suspenseId, "refunded");
        Integer refundCount = jdbc.queryForObject(
                "SELECT count(*) FROM payment.refund_order WHERE reason = ?", Integer.class, "suspense:" + suspenseId);
        assertThat(refundCount).isEqualTo(1);

        // 已销账的再点退款：409 拒绝，且不会多出第二张退款单
        assertThatThrownBy(() -> suspense.refund(suspenseId))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(409));
        Integer stillOne = jdbc.queryForObject(
                "SELECT count(*) FROM payment.refund_order WHERE reason = ?", Integer.class, "suspense:" + suspenseId);
        assertThat(stillOne).isEqualTo(1);
    }

    @Test
    void 挂账驳回_必须写原因_状态与原因一起落() {
        UUID paymentId = insertPayment("closed", 10_000);
        payments.handleCallback(callbackOf(paymentId, 10_000));
        UUID suspenseId = requireSuspense(paymentId).id();

        assertThatThrownBy(() -> suspense.dismiss(suspenseId, "  ")).isInstanceOf(BusinessException.class);

        suspense.dismiss(suspenseId, "渠道对账后撤回，非真实入账");
        SuspenseMapper.SuspenseRow row = suspenseStore.find(suspenseId).orElseThrow();
        assertThat(row.status()).isEqualTo("resolved");
        assertThat(row.resolution()).isEqualTo("dismissed");
        assertThat(row.note()).contains("渠道对账");

        // 已处理的不能再动
        assertThatThrownBy(() -> suspense.refund(suspenseId)).isInstanceOf(BusinessException.class);
    }

    // —— 种子与工具 ——

    /** 造一张指定状态的支付单；out_trade_no 从库里读回来，回调要靠它路由。 */
    private UUID insertPayment(String status, long expectedAmount) {
        UUID paymentId = Ids.newId();
        jdbc.update(
                """
                INSERT INTO payment.payment_order
                    (id, payment_no, buyer_id, order_group_id, channel, out_trade_no,
                     amount, expected_amount, currency, status, expires_at)
                VALUES (?, ?, ?, ?, 'mock', ?, ?, ?, ?, ?, now() + interval '30 minutes')
                """,
                paymentId,
                "PAY" + Ids.newId(),
                Ids.newId(),
                Ids.newId(),
                "OUT" + Ids.newId(),
                expectedAmount,
                expectedAmount,
                CNY,
                status);
        return paymentId;
    }

    /** mock 渠道的成功回调报文：out_trade_no 路由 + amount 报实收。 */
    private Map<String, String> callbackOf(UUID paymentId, long arrivedAmount) {
        String outTradeNo = jdbc.queryForObject(
                "SELECT out_trade_no FROM payment.payment_order WHERE id = ?", String.class, paymentId);
        return Map.of("out_trade_no", outTradeNo, "amount", String.valueOf(arrivedAmount));
    }

    private SuspenseMapper.SuspenseRow requireSuspense(UUID paymentId) {
        return suspenseStore.find(suspenseRowIdOf(paymentId)).orElseThrow();
    }

    private UUID suspenseRowIdOf(UUID paymentId) {
        return jdbc
                .query(
                        "SELECT id FROM payment.suspense_entry WHERE payment_id = ?",
                        (rs, i) -> rs.getObject("id", UUID.class),
                        paymentId)
                .stream()
                .findFirst()
                .orElse(null);
    }

    private void awaitResolved(UUID suspenseId, String resolution) throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            SuspenseMapper.SuspenseRow row = suspenseStore.find(suspenseId).orElse(null);
            if (row != null && "resolved".equals(row.status()) && resolution.equals(row.resolution())) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("挂账行没有被销账: " + suspenseId);
    }
}
