package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Money;
import com.shop.platform.order.api.OrderCheckoutLine;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderPaymentView;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.payment.mapper.Payment;
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

    private void stubOrder(OrderStatus status) {
        when(orderReadQuery.paymentViewById(orderId))
                .thenReturn(Optional.of(new OrderPaymentView("20260101120000001", userId, status, Money.cny(2000))));
    }

    // 发起（PENDING）
    @Test
    void 正常发起_落待确认流水_不推进订单状态机() {
        stubOrder(OrderStatus.PENDING_PAYMENT);
        stubInsertSuccess();
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(null);

        Payment payment = service.pay(userId, orderId);

        assertThat(payment.getStatus()).isEqualTo(PaymentStatus.PENDING); // 发起只占位，不动订单
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
    void 非本人订单_与不存在同一句话_404() {
        stubOrder(OrderStatus.PENDING_PAYMENT);
        UUID stranger = UUID.randomUUID();

        assertThatThrownBy(() -> service.pay(stranger, orderId)).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(404);
            assertThat(ex.getDetail()).isEqualTo("订单不存在");
        });
    }

    @Test
    void 已有成功流水_幂等返回同一笔_不再落库() {
        stubOrder(OrderStatus.PAID); // 订单已被前次支付推进
        Payment existing = new Payment();
        existing.setId(UUID.randomUUID());
        existing.setStatus(PaymentStatus.SUCCESS);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(existing);

        Payment again = service.pay(userId, orderId);

        assertThat(again.getId()).isEqualTo(existing.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 已有待确认流水_复用同一笔_不堆积多条PENDING() {
        stubOrder(OrderStatus.PENDING_PAYMENT);
        Payment pending = new Payment();
        pending.setId(UUID.randomUUID());
        pending.setStatus(PaymentStatus.PENDING);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(pending);

        Payment again = service.pay(userId, orderId);

        assertThat(again.getId()).isEqualTo(pending.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 非待付款态_409拒绝发起() {
        stubOrder(OrderStatus.CANCELLED);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(null);

        assertThatThrownBy(() -> service.pay(userId, orderId)).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(409);
        });
    }

    // 确认（PENDING→SUCCESS）
    private Payment pendingPayment(UUID paymentId, PaymentStatus status) {
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
        when(paymentMapper.selectById(paymentId)).thenReturn(pendingPayment(paymentId, PaymentStatus.PENDING));
        when(paymentMapper.transition(paymentId, PaymentStatus.SUCCESS)).thenReturn(1);

        Payment result = service.confirm(userId, paymentId);

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        verify(orderCommand).markPaid(orderId); // 同事务推进 PENDING_PAYMENT → PAID
    }

    @Test
    void 确认_非本人流水_404不泄露归属() {
        UUID paymentId = UUID.randomUUID();
        Payment stranger = pendingPayment(paymentId, PaymentStatus.PENDING);
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
        when(paymentMapper.selectById(paymentId)).thenReturn(pendingPayment(paymentId, PaymentStatus.SUCCESS));

        Payment result = service.confirm(userId, paymentId);

        assertThat(result.getStatus()).isEqualTo(PaymentStatus.SUCCESS);
        verify(paymentMapper, never()).transition(any(), any());
        verify(orderCommand, never()).markPaid(any());
    }

    @Test
    void 确认_状态已被抢占_409拒绝() {
        UUID paymentId = UUID.randomUUID();
        when(paymentMapper.selectById(paymentId)).thenReturn(pendingPayment(paymentId, PaymentStatus.PENDING));
        when(paymentMapper.transition(paymentId, PaymentStatus.SUCCESS)).thenReturn(0);

        assertThatThrownBy(() -> service.confirm(userId, paymentId))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(409);
                });
    }

    // 合并支付（整批按 checkout_key 发起 / 确认）
    private final UUID checkoutKey = UUID.randomUUID();

    private final UUID secondOrderId = UUID.randomUUID();

    private OrderCheckoutLine line(UUID id, String orderNo, OrderStatus status) {
        return new OrderCheckoutLine(id, orderNo, status, Money.cny(2000));
    }

    private Payment batchPayment(UUID payId, UUID orderId, PaymentStatus status) {
        Payment p = new Payment();
        p.setId(payId);
        p.setUserId(userId);
        p.setOrderId(orderId);
        p.setCheckoutKey(checkoutKey);
        p.setStatus(status);
        return p;
    }

    @Test
    void 合并发起_每张待付单各落一条PENDING_不推进订单() {
        stubInsertSuccess();
        when(orderReadQuery.checkoutLines(userId, checkoutKey))
                .thenReturn(List.of(
                        line(orderId, "N1", OrderStatus.PENDING_PAYMENT),
                        line(secondOrderId, "N2", OrderStatus.PENDING_PAYMENT)));
        when(paymentMapper.selectSuccessByOrder(any())).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(any())).thenReturn(null);

        List<Payment> rows = service.payBatch(userId, checkoutKey);

        assertThat(rows).hasSize(2);
        assertThat(rows).allSatisfy(p -> {
            assertThat(p.getStatus()).isEqualTo(PaymentStatus.PENDING);
            assertThat(p.getCheckoutKey()).isEqualTo(checkoutKey);
        });
        verify(orderCommand, never()).markPaid(any());
    }

    @Test
    void 合并发起_整批重复提交复用既有流水_不再落库() {
        when(orderReadQuery.checkoutLines(userId, checkoutKey))
                .thenReturn(List.of(line(orderId, "N1", OrderStatus.PENDING_PAYMENT)));
        Payment pending = batchPayment(UUID.randomUUID(), orderId, PaymentStatus.PENDING);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);
        when(paymentMapper.selectPendingByOrder(orderId)).thenReturn(pending);

        List<Payment> rows = service.payBatch(userId, checkoutKey);

        assertThat(rows).extracting(Payment::getId).containsExactly(pending.getId());
        verify(paymentMapper, never()).insert(any(Payment.class));
    }

    @Test
    void 合并发起_批次为空_404() {
        when(orderReadQuery.checkoutLines(userId, checkoutKey)).thenReturn(List.of());

        assertThatThrownBy(() -> service.payBatch(userId, checkoutKey))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                });
    }

    @Test
    void 合并确认_整批转成功并逐单推进订单() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        when(paymentMapper.selectByCheckoutKey(userId, checkoutKey))
                .thenReturn(List.of(
                        batchPayment(p1, orderId, PaymentStatus.PENDING),
                        batchPayment(p2, secondOrderId, PaymentStatus.PENDING)));
        when(paymentMapper.transition(p1, PaymentStatus.SUCCESS)).thenReturn(1);
        when(paymentMapper.transition(p2, PaymentStatus.SUCCESS)).thenReturn(1);

        List<Payment> rows = service.confirmBatch(userId, checkoutKey);

        assertThat(rows).allSatisfy(p -> assertThat(p.getStatus()).isEqualTo(PaymentStatus.SUCCESS));
        verify(orderCommand).markPaid(orderId);
        verify(orderCommand).markPaid(secondOrderId);
    }

    @Test
    void 合并确认_已成功单幂等跳过_只推进待确认单() {
        UUID p1 = UUID.randomUUID();
        UUID p2 = UUID.randomUUID();
        when(paymentMapper.selectByCheckoutKey(userId, checkoutKey))
                .thenReturn(List.of(
                        batchPayment(p1, orderId, PaymentStatus.SUCCESS),
                        batchPayment(p2, secondOrderId, PaymentStatus.PENDING)));
        when(paymentMapper.transition(p2, PaymentStatus.SUCCESS)).thenReturn(1);

        service.confirmBatch(userId, checkoutKey);

        verify(paymentMapper, never()).transition(p1, PaymentStatus.SUCCESS);
        verify(orderCommand, never()).markPaid(orderId);
        verify(orderCommand).markPaid(secondOrderId);
    }

    @Test
    void 合并确认_批次无流水_404() {
        when(paymentMapper.selectByCheckoutKey(userId, checkoutKey)).thenReturn(List.of());

        assertThatThrownBy(() -> service.confirmBatch(userId, checkoutKey))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(404);
                });
    }

    @Test
    void 合并确认_某单被取消致markPaid抛409_异常上抛由事务整批回滚() {
        UUID p1 = UUID.randomUUID();
        when(paymentMapper.selectByCheckoutKey(userId, checkoutKey))
                .thenReturn(List.of(batchPayment(p1, orderId, PaymentStatus.PENDING)));
        when(paymentMapper.transition(p1, PaymentStatus.SUCCESS)).thenReturn(1);
        org.mockito.Mockito.doThrow(BusinessException.conflict("订单已关闭"))
                .when(orderCommand)
                .markPaid(orderId);

        assertThatThrownBy(() -> service.confirmBatch(userId, checkoutKey))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getHttpStatus()).isEqualTo(409);
                });
    }
}
