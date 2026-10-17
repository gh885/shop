package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.TradeCommand;
import com.shop.platform.order.api.TradePaymentView;
import com.shop.platform.order.api.TradeReadQuery;
import com.shop.platform.order.model.TradeStatus;
import com.shop.platform.payment.gateway.MockPaymentGateway;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import com.shop.platform.payment.model.PaymentStatus;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 支付业务单测（资金路径）：支付归属主订单，流水仍按子订单各记一条。
 * 发起只落 PENDING 不动订单；确认逐单推进子订单，全部付清才推进主订单。
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    private final UUID userId = UUID.randomUUID();

    private final UUID tradeId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    private final UUID secondOrderId = UUID.randomUUID();

    @Mock
    private PaymentMapper paymentMapper;

    @Mock
    private TradeReadQuery tradeReadQuery;

    @Mock
    private OrderCommand orderCommand;

    @Mock
    private TradeCommand tradeCommand;

    private PaymentService service;

    @BeforeEach
    void setUp() {
        PaymentChannels channels = new PaymentChannels(List.of(new MockPaymentGateway()), new PaymentProperties());
        service = new PaymentService(paymentMapper, tradeReadQuery, orderCommand, tradeCommand, channels);
    }

    private void stubInsertSuccess() {
        when(paymentMapper.insert(any(Payment.class))).thenAnswer(inv -> {
            inv.getArgument(0, Payment.class).setId(UUID.randomUUID());
            return 1;
        });
    }

    private TradePaymentView trade(TradeStatus status, UUID... orderIds) {
        List<TradePaymentView.TradePaymentLine> lines = java.util.Arrays.stream(orderIds)
                .map(id -> new TradePaymentView.TradePaymentLine(id, "N-" + id, Money.cny(2000)))
                .toList();
        return new TradePaymentView(tradeId, "T-1", userId, status, Money.cny(2000L * orderIds.length), lines);
    }

    private void stubTrade(TradeStatus status, UUID... orderIds) {
        when(tradeReadQuery.paymentViewById(tradeId)).thenReturn(Optional.of(trade(status, orderIds)));
    }

    private Payment payment(UUID id, UUID order, PaymentStatus status) {
        Payment p = new Payment();
        p.setId(id);
        p.setTradeId(tradeId);
        p.setOrderId(order);
        p.setOrderNo("N-" + order);
        p.setUserId(userId);
        p.setAmount(2000L);
        p.setCurrency("CNY");
        p.setStatus(status);
        return p;
    }

    // 发起
    @Test
    void 整单发起_每张子订单各落一条PENDING_不推进订单() {
        stubInsertSuccess();
        stubTrade(TradeStatus.PENDING_PAYMENT, orderId, secondOrderId);
        when(paymentMapper.selectSuccessByOrder(any())).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(any())).thenReturn(null);

        PaymentBatchView view = service.payTrade(userId, tradeId);

        assertThat(view.payments()).hasSize(2);
        assertThat(view.totalAmount()).isEqualTo(Money.cny(4000));
        assertThat(view.payments()).allSatisfy(p -> {
            assertThat(p.status()).isEqualTo(PaymentStatus.PENDING);
            assertThat(p.tradeId()).isEqualTo(tradeId);
        });
        verify(orderCommand, never()).markPaid(any());
    }

    @Test
    void 主订单不存在_404() {
        when(tradeReadQuery.paymentViewById(tradeId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.payTrade(userId, tradeId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 非本人主订单_与不存在同一句话_404() {
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(new TradePaymentView(
                        tradeId, "T-1", UUID.randomUUID(), TradeStatus.PENDING_PAYMENT, Money.cny(2000), List.of())));

        assertThatThrownBy(() -> service.payTrade(userId, tradeId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                    assertThat(ex.getDetail()).isEqualTo("订单不存在");
                });
    }

    @Test
    void 已付清主订单_幂等返回成功流水_不再落库() {
        Payment success = payment(UUID.randomUUID(), orderId, PaymentStatus.SUCCESS);
        when(tradeReadQuery.paymentViewById(tradeId)).thenReturn(Optional.of(trade(TradeStatus.PAID, orderId)));
        when(paymentMapper.selectByTrade(tradeId)).thenReturn(List.of(success));

        PaymentBatchView view = service.payTrade(userId, tradeId);

        assertThat(view.payments()).extracting(PaymentView::id).containsExactly(success.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 非待支付态_409拒绝发起() {
        when(tradeReadQuery.paymentViewById(tradeId)).thenReturn(Optional.of(trade(TradeStatus.CLOSED, orderId)));

        assertThatThrownBy(() -> service.payTrade(userId, tradeId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(409));
    }

    @Test
    void 已有待确认流水_复用同一笔_不堆积多条PENDING() {
        Payment pending = payment(UUID.randomUUID(), orderId, PaymentStatus.PENDING);
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(trade(TradeStatus.PENDING_PAYMENT, orderId)));
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(pending);

        PaymentBatchView view = service.payTrade(userId, tradeId);

        assertThat(view.payments()).extracting(PaymentView::id).containsExactly(pending.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 按子订单补付入口_返回该子订单的流水() {
        stubInsertSuccess();
        when(tradeReadQuery.tradeIdByOrderId(orderId)).thenReturn(Optional.of(tradeId));
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(trade(TradeStatus.PENDING_PAYMENT, orderId)));
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(null);

        Payment payment = service.pay(userId, orderId);

        assertThat(payment.getOrderId()).isEqualTo(orderId);
        assertThat(payment.getTradeId()).isEqualTo(tradeId);
    }

    // 确认
    @Test
    void 整单确认_逐单置成功并推进子订单与主订单() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(trade(TradeStatus.PENDING_PAYMENT, orderId, secondOrderId)));
        when(paymentMapper.selectByTrade(tradeId))
                .thenReturn(List.of(
                        payment(p1, orderId, PaymentStatus.PENDING),
                        payment(p2, secondOrderId, PaymentStatus.PENDING)));
        when(paymentMapper.confirmSuccess(eq(p1), any(), nullable(String.class)))
                .thenReturn(1);
        when(paymentMapper.confirmSuccess(eq(p2), any(), nullable(String.class)))
                .thenReturn(1);

        PaymentBatchView view = service.confirmTrade(userId, tradeId);

        assertThat(view.payments()).allSatisfy(p -> assertThat(p.status()).isEqualTo(PaymentStatus.SUCCESS));
        verify(orderCommand).markPaid(orderId);
        verify(orderCommand).markPaid(secondOrderId);
        verify(tradeCommand).markPaidIfComplete(tradeId);
    }

    @Test
    void 整单确认_已成功单幂等跳过_只推进待确认单() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(trade(TradeStatus.PENDING_PAYMENT, orderId, secondOrderId)));
        when(paymentMapper.selectByTrade(tradeId))
                .thenReturn(List.of(
                        payment(p1, orderId, PaymentStatus.SUCCESS),
                        payment(p2, secondOrderId, PaymentStatus.PENDING)));
        when(paymentMapper.confirmSuccess(eq(p2), any(), nullable(String.class)))
                .thenReturn(1);

        service.confirmTrade(userId, tradeId);

        verify(paymentMapper, never()).confirmSuccess(eq(p1), any(), nullable(String.class));
        verify(orderCommand, never()).markPaid(orderId);
        verify(orderCommand).markPaid(secondOrderId);
    }

    @Test
    void 整单确认_无流水_404() {
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(trade(TradeStatus.PENDING_PAYMENT, orderId)));
        when(paymentMapper.selectByTrade(tradeId)).thenReturn(List.of());

        assertThatThrownBy(() -> service.confirmTrade(userId, tradeId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 整单确认_某单被取消致markPaid抛409_异常上抛由事务整批回滚() {
        UUID p1 = UUID.randomUUID();
        when(tradeReadQuery.paymentViewById(tradeId))
                .thenReturn(Optional.of(trade(TradeStatus.PENDING_PAYMENT, orderId)));
        when(paymentMapper.selectByTrade(tradeId)).thenReturn(List.of(payment(p1, orderId, PaymentStatus.PENDING)));
        when(paymentMapper.confirmSuccess(eq(p1), any(), nullable(String.class)))
                .thenReturn(1);
        org.mockito.Mockito.doThrow(BusinessException.conflict("订单已关闭"))
                .when(orderCommand)
                .markPaid(orderId);

        assertThatThrownBy(() -> service.confirmTrade(userId, tradeId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(409));
    }

    @Test
    void 单条确认_置成功并尝试推进主订单() {
        UUID paymentId = UUID.randomUUID();
        Payment pending = payment(paymentId, orderId, PaymentStatus.PENDING);
        when(paymentMapper.selectById(paymentId)).thenReturn(pending);
        when(paymentMapper.confirmSuccess(eq(paymentId), any(), nullable(String.class)))
                .thenReturn(1);

        Payment result = service.confirm(userId, paymentId);

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        verify(orderCommand).markPaid(orderId);
        verify(tradeCommand).markPaidIfComplete(tradeId);
    }

    @Test
    void 确认_非本人流水_404不泄露归属() {
        UUID paymentId = UUID.randomUUID();
        Payment stranger = payment(paymentId, orderId, PaymentStatus.PENDING);
        stranger.setUserId(UUID.randomUUID());
        when(paymentMapper.selectById(paymentId)).thenReturn(stranger);

        assertThatThrownBy(() -> service.confirm(userId, paymentId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                    assertThat(ex.getDetail()).isEqualTo("支付流水不存在");
                });
    }

    @Test
    void 确认_流水不存在_404() {
        UUID paymentId = UUID.randomUUID();
        when(paymentMapper.selectById(paymentId)).thenReturn(null);

        assertThatThrownBy(() -> service.confirm(userId, paymentId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 确认_已成功_幂等直接返回() {
        UUID paymentId = UUID.randomUUID();
        when(paymentMapper.selectById(paymentId)).thenReturn(payment(paymentId, orderId, PaymentStatus.SUCCESS));

        Payment result = service.confirm(userId, paymentId);

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        verify(paymentMapper, never()).confirmSuccess(any(), any(), nullable(String.class));
        verify(orderCommand, never()).markPaid(any());
    }

    @Test
    void 确认_状态已被抢占_409拒绝() {
        UUID paymentId = UUID.randomUUID();
        when(paymentMapper.selectById(paymentId)).thenReturn(payment(paymentId, orderId, PaymentStatus.PENDING));
        when(paymentMapper.confirmSuccess(eq(paymentId), any(), nullable(String.class)))
                .thenReturn(0);

        assertThatThrownBy(() -> service.confirm(userId, paymentId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(409));
    }
}
