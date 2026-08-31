package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderPaymentView;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.payment.mapper.Payment;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 支付业务单测（资金路径，两段式状态机）：发起只落 PENDING 流水不动订单；
 * 确认推进 PENDING→SUCCESS + 订单状态机；归属校验、幂等短路、非待付款拒绝。
 */
@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    private final UUID userId = UUID.randomUUID();

    private final UUID orderId = UUID.randomUUID();

    @Mock
    private com.shop.platform.payment.mapper.PaymentMapper paymentMapper;

    @Mock
    private OrderReadQuery orderReadQuery;

    @Mock
    private OrderCommand orderCommand;

    private PaymentService service;

    @BeforeEach
    void setUp() {
        service = new PaymentService(paymentMapper, orderReadQuery, orderCommand);
    }

    /** insert 成功且回填 id（仅落库类用例需要；幂等/并发用例不触发 insert） */
    private void stubInsertSuccess() {
        when(paymentMapper.insert(any(Payment.class))).thenAnswer(inv -> {
            inv.getArgument(0, Payment.class).setId(UUID.randomUUID());
            return 1;
        });
    }

    private void stubOrder(String status) {
        when(orderReadQuery.paymentViewById(orderId))
                .thenReturn(Optional.of(new OrderPaymentView("20260101120000001", userId, status, 2000L, "CNY")));
    }

    // ========== 发起（PENDING） ==========

    @Test
    void 正常发起_落待确认流水_不推进订单状态机() {
        stubOrder("PENDING_PAYMENT");
        stubInsertSuccess();
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(null);

        Payment payment = service.pay(userId, orderId);

        assertThat(payment.getStatus()).isEqualTo(Payment.STATUS_PENDING); // 发起只占位，不动订单
        assertThat(payment.getAmount()).isEqualTo(2000L); // 金额以订单投影为准
        assertThat(payment.getChannel()).isEqualTo(Payment.CHANNEL_MOCK);
        verify(orderCommand, never()).markPaid(any());
    }

    @Test
    void 订单不存在_404() {
        when(orderReadQuery.paymentViewById(orderId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.pay(userId, orderId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> assertThat(ex.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 非本人订单_与不存在同一句话_不泄露归属() {
        stubOrder("PENDING_PAYMENT");
        UUID stranger = UUID.randomUUID();

        assertThatThrownBy(() -> service.pay(stranger, orderId)).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(400);
            assertThat(ex.getDetail()).isEqualTo("订单不存在");
        });
    }

    @Test
    void 已有成功流水_幂等返回同一笔_不再落库() {
        stubOrder("PAID"); // 订单已被前次支付推进
        Payment existing = new Payment();
        existing.setId(UUID.randomUUID());
        existing.setStatus(Payment.STATUS_SUCCESS);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(existing);

        Payment again = service.pay(userId, orderId);

        assertThat(again.getId()).isEqualTo(existing.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 已有待确认流水_复用同一笔_不堆积多条PENDING() {
        stubOrder("PENDING_PAYMENT");
        Payment pending = new Payment();
        pending.setId(UUID.randomUUID());
        pending.setStatus(Payment.STATUS_PENDING);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(pending);

        Payment again = service.pay(userId, orderId);

        assertThat(again.getId()).isEqualTo(pending.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 非待付款态_409拒绝发起() {
        stubOrder("CANCELLED");
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(null);

        assertThatThrownBy(() -> service.pay(userId, orderId)).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(409);
        });
    }

    // ========== 确认（PENDING→SUCCESS） ==========

    private Payment pendingPayment(UUID paymentId, String status) {
        Payment p = new Payment();
        p.setId(paymentId);
        p.setUserId(userId);
        p.setOrderId(orderId);
        p.setStatus(status);
        return p;
    }

    @Test
    void 正常确认_置成功并推进订单状态机() {
        UUID paymentId = UUID.randomUUID();
        when(paymentMapper.selectById(paymentId)).thenReturn(pendingPayment(paymentId, Payment.STATUS_PENDING));
        when(paymentMapper.transition(paymentId, Payment.STATUS_SUCCESS)).thenReturn(1);

        Payment result = service.confirm(userId, paymentId);

        assertThat(result.getStatus()).isEqualTo(Payment.STATUS_SUCCESS);
        verify(orderCommand).markPaid(orderId); // 同事务推进 PENDING_PAYMENT → PAID
    }

    @Test
    void 确认_非本人流水_不泄露归属() {
        UUID paymentId = UUID.randomUUID();
        Payment stranger = pendingPayment(paymentId, Payment.STATUS_PENDING);
        stranger.setUserId(UUID.randomUUID());
        when(paymentMapper.selectById(paymentId)).thenReturn(stranger);

        assertThatThrownBy(() -> service.confirm(userId, paymentId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(400);
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
        when(paymentMapper.selectById(paymentId)).thenReturn(pendingPayment(paymentId, Payment.STATUS_SUCCESS));

        Payment result = service.confirm(userId, paymentId);

        assertThat(result.getStatus()).isEqualTo(Payment.STATUS_SUCCESS);
        verify(paymentMapper, never()).transition(any(), any());
        verify(orderCommand, never()).markPaid(any());
    }

    @Test
    void 确认_状态已被抢占_409拒绝() {
        UUID paymentId = UUID.randomUUID();
        when(paymentMapper.selectById(paymentId)).thenReturn(pendingPayment(paymentId, Payment.STATUS_PENDING));
        when(paymentMapper.transition(paymentId, Payment.STATUS_SUCCESS)).thenReturn(0);

        assertThatThrownBy(() -> service.confirm(userId, paymentId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(409);
                });
    }
}
