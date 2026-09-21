package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.shop.platform.aftersale.events.AfterSaleRefundedEvent;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.gateway.PaymentGatewayException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import com.shop.platform.payment.model.PaymentStatus;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;

/**
 * 退款监听单测：退款<b>先经网关受理、后落本地 REFUNDED</b>；两条通知对「无流水可退 / 渠道拒退」的
 * 取舍刻意相反——取消放行人工对账、售后回滚不假报已退款。
 * 放行分支同时埋 payment.refund.failed 事件（MDC 字段随 ECS 信封落 JSON），用 ListAppender 断言结构。
 */
@ExtendWith(MockitoExtension.class)
class PaymentRefundListenerTest {

    private final UUID orderId = UUID.randomUUID();

    private final UUID paymentId = UUID.randomUUID();

    @Mock
    private PaymentMapper paymentMapper;

    @Mock
    private PaymentGateway paymentGateway;

    @InjectMocks
    private PaymentRefundListener listener;

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    PaymentRefundListenerTest() {
        logs.start();
        ((Logger) LoggerFactory.getLogger(PaymentRefundListener.class)).addAppender(logs);
    }

    @AfterEach
    void detachAppender() {
        ((Logger) LoggerFactory.getLogger(PaymentRefundListener.class)).detachAppender(logs);
    }

    private Payment successPayment() {
        Payment p = new Payment();
        p.setId(paymentId);
        p.setOrderId(orderId);
        p.setOrderNo("20260101120000001");
        p.setAmount(2000L);
        p.setCurrency("CNY");
        p.setStatus(PaymentStatus.SUCCESS);
        return p;
    }

    private void stubSuccessAndOutcome(String refundNo) {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());
        when(paymentGateway.refund(any())).thenReturn(new PaymentGateway.RefundOutcome(refundNo));
    }

    @Test
    void 取消_网关受理成功_置退款并回填渠道号() {
        stubSuccessAndOutcome("MOCK-REFUND-xxx");
        listener.onOrderCancelled(new OrderCancelledEvent(orderId, UUID.randomUUID()));
        verify(paymentGateway).refund(any());
        verify(paymentMapper).refundByOrder(eq(orderId), any(), eq("MOCK-REFUND-xxx"));
    }

    @Test
    void 售后_网关受理成功_置退款并回填渠道号() {
        stubSuccessAndOutcome("MOCK-REFUND-yyy");
        listener.onAfterSaleRefunded(new AfterSaleRefundedEvent(orderId, UUID.randomUUID(), Money.cny(2000)));
        verify(paymentMapper).refundByOrder(eq(orderId), any(), eq("MOCK-REFUND-yyy"));
    }

    @Test
    void 取消_无成功流水_放行且不调网关_埋失败事件() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        UUID userId = UUID.randomUUID();
        listener.onOrderCancelled(new OrderCancelledEvent(orderId, userId));
        verify(paymentGateway, never()).refund(any());
        verify(paymentMapper, never()).refundByOrder(any(), any(), anyString());

        // 对账缺口必须留下可聚合的事件（docs/conventions/business-event-logging.md）
        var event = onlyErrorEvent();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "payment.refund.failed")
                .containsEntry("reason", "no_success_payment")
                .containsEntry("order_id", orderId.toString())
                .containsEntry("user_id", userId.toString());
    }

    @Test
    void 售后_无成功流水_抛异常回滚() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        assertThatThrownBy(() -> listener.onAfterSaleRefunded(
                        new AfterSaleRefundedEvent(orderId, UUID.randomUUID(), Money.cny(2000))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("没有可退款的支付流水");
        // 回滚分支不埋放行事件：失败随异常上报，售后单停回申请中由人工处理
        assertThat(logs.list).isEmpty();
    }

    @Test
    void 取消_渠道拒退_放行不落退款_埋失败事件() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());
        when(paymentGateway.refund(any())).thenThrow(new PaymentGatewayException("拒退"));
        UUID userId = UUID.randomUUID();
        listener.onOrderCancelled(new OrderCancelledEvent(orderId, userId));
        verify(paymentMapper, never()).refundByOrder(any(), any(), anyString());

        var event = onlyErrorEvent();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "payment.refund.failed")
                .containsEntry("reason", "gateway_rejected")
                .containsEntry("order_id", orderId.toString())
                .containsEntry("user_id", userId.toString())
                .containsEntry("error.type", PaymentGatewayException.class.getSimpleName())
                .containsEntry("error.message", "拒退");
    }

    private ch.qos.logback.classic.spi.ILoggingEvent onlyErrorEvent() {
        assertThat(logs.list).hasSize(1);
        var event = logs.list.getFirst();
        assertThat(event.getLevel().toString()).isEqualTo("ERROR");
        return event;
    }

    @Test
    void 售后_渠道拒退_抛异常回滚() {
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(successPayment());
        when(paymentGateway.refund(any())).thenThrow(new PaymentGatewayException("拒退"));
        assertThatThrownBy(() -> listener.onAfterSaleRefunded(
                        new AfterSaleRefundedEvent(orderId, UUID.randomUUID(), Money.cny(2000))))
                .isInstanceOf(PaymentGatewayException.class);
        verify(paymentMapper, never()).refundByOrder(any(), any(), anyString());
    }
}
