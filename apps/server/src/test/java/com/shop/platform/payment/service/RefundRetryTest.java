package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.id.Ids;
import com.shop.platform.payment.internal.PaymentChannel;
import com.shop.platform.payment.mapper.PaymentOrderStore;
import com.shop.platform.payment.mapper.RefundOrderStore;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * 退款重试的三条边界：失败计次并留在 pending、成功走与首试同一条通道置 success、
 * 超上限的不再被捞出来。渠道用桩替换，不走真渠道。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RefundRetryTest {

    private static final String CNY = "CNY";

    @Autowired
    private RefundOrderStore refunds;

    @Autowired
    private PaymentOrderStore payments;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ApplicationEventPublisher publisher;

    @Test
    void retrySucceedsAndMarksRefundSuccess() {
        UUID groupId = insertPayment();
        RefundOrderStore.RefundRow refund = insertPendingRefund(groupId);

        RefundService service = new RefundService(payments, refunds, accept(), publisher);

        assertThat(service.retryPending(refund)).isTrue();
        assertThat(refunds.findByBiz(refund.paymentId(), refund.sellerOrderId(), refund.reason())
                        .orElseThrow()
                        .status())
                .isEqualTo("success");
    }

    @Test
    void rejectedRetryStaysPendingAndCountsAttempt() {
        UUID groupId = insertPayment();
        RefundOrderStore.RefundRow refund = insertPendingRefund(groupId);
        RefundService service = new RefundService(payments, refunds, reject(), publisher);

        assertThat(service.retryPending(refund)).isFalse();
        RefundOrderStore.RefundRow after = refunds.findByBiz(
                        refund.paymentId(), refund.sellerOrderId(), refund.reason())
                .orElseThrow();
        assertThat(after.status()).isEqualTo("pending");
        assertThat(after.attempts()).isEqualTo(1);

        // 上限内仍会被捞出来重试
        assertThat(refunds.findStalePending(Instant.now(), 100, 10))
                .anyMatch(row -> row.id().equals(refund.id()));
    }

    @Test
    void channelExceptionStaysPendingAndCountsAttempt() {
        UUID groupId = insertPayment();
        RefundOrderStore.RefundRow refund = insertPendingRefund(groupId);
        RefundService service = new RefundService(payments, refunds, explode(), publisher);

        assertThat(service.retryPending(refund)).isFalse();
        assertThat(refunds.findByBiz(refund.paymentId(), refund.sellerOrderId(), refund.reason())
                        .orElseThrow()
                        .attempts())
                .isEqualTo(1);
    }

    @Test
    void overBudgetRefundsAreNotPickedUp() {
        UUID groupId = insertPayment();
        RefundOrderStore.RefundRow refund = insertPendingRefund(groupId);
        jdbc.update("UPDATE payment.refund_order SET attempts = 10 WHERE id = ?", refund.id());

        assertThat(refunds.findStalePending(Instant.now(), 100, 10))
                .noneMatch(row -> row.id().equals(refund.id()));
    }

    /** 渠道受理成功。 */
    private PaymentChannel accept() {
        return new StubChannel(new PaymentChannel.RefundResult(true, "CH-REFUND-1", "{}"));
    }

    /** 渠道明确不受理。 */
    private PaymentChannel reject() {
        return new StubChannel(new PaymentChannel.RefundResult(false, null, "{}"));
    }

    /** 渠道炸了（超时、未实现退款）。 */
    private PaymentChannel explode() {
        return new StubChannel(null) {
            @Override
            public RefundResult refund(Refund refund) {
                throw new UnsupportedOperationException("渠道不支持退款");
            }
        };
    }

    private UUID insertPayment() {
        UUID groupId = Ids.newId();
        jdbc.update(
                """
                INSERT INTO payment.payment_order
                    (id, pay_no, buyer_id, order_group_id, channel, out_trade_no,
                     amount, expected_amount, currency, status, expire_at)
                VALUES (?, ?, ?, ?, 'mock', ?, 10000, 10000, ?, 'success', now() + interval '30 minutes')
                """,
                Ids.newId(),
                "PAY" + Ids.newId(),
                Ids.newId(),
                groupId,
                "OUT" + Ids.newId(),
                CNY);
        return groupId;
    }

    private RefundOrderStore.RefundRow insertPendingRefund(UUID groupId) {
        UUID paymentId = jdbc.queryForObject(
                "SELECT id FROM payment.payment_order WHERE order_group_id = ?", UUID.class, groupId);
        UUID sellerOrderId = Ids.newId();
        UUID refundId = Ids.newId();
        String reason = Ids.newId().toString();
        refunds.insert(refundId, "RF" + Ids.newId(), paymentId, groupId, sellerOrderId, 50_00L, CNY, reason);
        return refunds.findByBiz(paymentId, sellerOrderId, reason).orElseThrow();
    }

    private static class StubChannel implements PaymentChannel {

        private final RefundResult result;

        StubChannel(RefundResult result) {
            this.result = result;
        }

        @Override
        public String code() {
            return "stub";
        }

        @Override
        public String createPayment(Charge charge) {
            return "";
        }

        @Override
        public CallbackResult parseCallback(Map<String, String> rawParams) {
            throw new UnsupportedOperationException();
        }

        @Override
        public CallbackResult query(String outTradeNo) {
            return null;
        }

        @Override
        public RefundResult refund(Refund refund) {
            return result;
        }
    }
}
