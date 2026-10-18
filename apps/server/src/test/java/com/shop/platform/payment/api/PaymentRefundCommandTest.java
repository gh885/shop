package com.shop.platform.payment.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.gateway.PaymentGatewayException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import com.shop.platform.payment.model.PaymentStatus;
import com.shop.platform.payment.service.PaymentChannels;
import com.shop.platform.testsupport.EventCapture;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 渠道退款命令单测：退款单号即渠道幂等键、受理成功才累计已退额、拒退返回失败而不抛（由退款单的重试线取舍）。
 *
 * <p>失败的三种形态分开断言：渠道拒退（可重试，返回 false）、查无成功流水（数据不一致，404）、
 * 金额超额（数据不一致，409）。后两者抛异常让整笔回滚——重试一万次也不会变。
 */
@ExtendWith(MockitoExtension.class)
class PaymentRefundCommandTest {

    private final UUID orderId = UUID.randomUUID();

    private final UUID paymentId = UUID.randomUUID();

    @Mock
    private PaymentMapper paymentMapper;

    @Mock
    private PaymentChannels paymentChannels;

    @Mock
    private PaymentGateway paymentGateway;

    @InjectMocks
    private PaymentRefundCommand command;

    @BeforeEach
    void stubChannel() {
        org.mockito.Mockito.lenient().when(paymentChannels.of(any())).thenReturn(paymentGateway);
    }

    private Payment successPayment() {
        Payment p = new Payment();
        p.setId(paymentId);
        p.setOrderId(orderId);
        p.setOrderNo("20260101120000001");
        p.setAmount(2000L);
        p.setRefundedAmount(0L);
        p.setCurrency("CNY");
        p.setChannel(Payment.CHANNEL_MOCK);
        p.setStatus(PaymentStatus.SUCCESS);
        return p;
    }

    private PaymentRefund request(long amount) {
        return new PaymentRefund(orderId, "RF20260101120000001", Money.ofFen(amount, Money.CNY), "退款单 RF");
    }

    @Test
    void 渠道受理成功_按退款单号幂等提交并累计已退额() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());
        when(paymentGateway.refund(any())).thenReturn(new PaymentGateway.RefundOutcome("MOCK-REFUND-1"));
        when(paymentMapper.applyRefund(eq(paymentId), eq(1000L), any(), eq("MOCK-REFUND-1")))
                .thenReturn(1);
        var events = new EventCapture();
        try (events) {
            PaymentRefundAttempt attempt = command.refund(request(1000));

            assertThat(attempt.success()).isTrue();
            assertThat(attempt.gatewayRefundNo()).isEqualTo("MOCK-REFUND-1");
        }

        // 渠道参数里带的必须是退款单号：重试时渠道据此识别为同一笔，而不是再退一次
        verify(paymentGateway)
                .refund(org.mockito.ArgumentMatchers.argThat(p ->
                        "RF20260101120000001".equals(p.refundNo()) && p.amount().amount() == 1000));

        assertThat(events.fields("payment.refunded"))
                .containsEntry("order_id", orderId.toString())
                .containsEntry("refund_no", "RF20260101120000001")
                .containsEntry("amount", Money.ofFen(1000, Money.CNY).toString());
        assertThat(events.level("payment.refunded")).isEqualTo("INFO");
    }

    @Test
    void 渠道拒退_不累计不抛_埋失败事件交给重试线() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());
        when(paymentGateway.refund(any())).thenThrow(new PaymentGatewayException("拒退"));
        var events = new EventCapture();
        try (events) {
            PaymentRefundAttempt attempt = command.refund(request(2000));

            assertThat(attempt.success()).isFalse();
            assertThat(attempt.errorMessage()).isEqualTo("拒退");
        }

        verify(paymentMapper, never()).applyRefund(any(), anyLong(), any(), anyString());
        assertThat(events.fields("payment.refund.failed"))
                .containsEntry("reason", "gateway_rejected")
                .containsEntry("order_id", orderId.toString())
                .containsEntry("refund_no", "RF20260101120000001");
        assertThat(events.level("payment.refund.failed")).isEqualTo("ERROR");
    }

    @Test
    void 查无成功流水_404且不调渠道() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);

        assertThatThrownBy(() -> command.refund(request(2000)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("没有可退款的支付流水");
        verify(paymentGateway, never()).refund(any());
    }

    @Test
    void 币种不一致_400且不调渠道() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());

        assertThatThrownBy(() -> command.refund(new PaymentRefund(orderId, "RF1", Money.ofFen(2000, "USD"), "退款单 RF1")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("币种");
        verify(paymentGateway, never()).refund(any());
    }

    @Test
    void 超过可退额度_409且整笔回滚() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());
        when(paymentGateway.refund(any())).thenReturn(new PaymentGateway.RefundOutcome("MOCK-REFUND-2"));
        when(paymentMapper.applyRefund(eq(paymentId), eq(3000L), any(), anyString()))
                .thenReturn(0);

        assertThatThrownBy(() -> command.refund(request(3000)))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("超过该笔支付的可退额度");
    }
}
