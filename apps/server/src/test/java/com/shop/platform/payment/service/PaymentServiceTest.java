package com.shop.platform.payment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
import org.springframework.dao.DuplicateKeyException;

/**
 * 支付业务单测（资金路径）：归属校验、幂等短路（重试/连点回到同一笔流水）、
 * 非待付款拒绝、并发撞唯一索引回退。MOCK 渠道状态机推进见 OrderFlowIT。
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

    @Test
    void 正常支付_落成功流水并推状态机() {
        stubOrder("PENDING_PAYMENT");
        stubInsertSuccess();
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);

        Payment payment = service.pay(userId, orderId);

        assertThat(payment.getStatus()).isEqualTo(Payment.STATUS_SUCCESS);
        assertThat(payment.getAmount()).isEqualTo(2000L); // 金额以订单投影为准
        assertThat(payment.getChannel()).isEqualTo(Payment.CHANNEL_MOCK);
        org.mockito.Mockito.verify(orderCommand).markPaid(orderId); // 同事务推进 PENDING_PAYMENT → PAID
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
    void 已有成功流水_幂等返回同一笔_不再落库不再推状态机() {
        stubOrder("PAID"); // 订单已被前次支付推进
        Payment existing = new Payment();
        existing.setId(UUID.randomUUID());
        existing.setStatus(Payment.STATUS_SUCCESS);
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(existing);

        Payment again = service.pay(userId, orderId);

        assertThat(again.getId()).isEqualTo(existing.getId());
        org.mockito.Mockito.verify(paymentMapper, org.mockito.Mockito.never()).insert(any(Payment.class));
        org.mockito.Mockito.verify(orderCommand, org.mockito.Mockito.never()).markPaid(any());
    }

    @Test
    void 非待付款态_409拒绝() {
        stubOrder("CANCELLED");
        when(paymentMapper.selectSuccessByOrder(orderId)).thenReturn(null);

        assertThatThrownBy(() -> service.pay(userId, orderId)).isInstanceOfSatisfying(BusinessException.class, ex -> {
            assertThat(ex.getHttpStatus()).isEqualTo(409);
        });
    }

    @Test
    void 并发重复支付撞唯一索引_退回既有流水() {
        stubOrder("PENDING_PAYMENT");
        Payment winner = new Payment();
        winner.setId(UUID.randomUUID());
        winner.setStatus(Payment.STATUS_SUCCESS);
        when(paymentMapper.selectSuccessByOrder(orderId))
                .thenReturn(null) // 首查无流水
                .thenReturn(winner); // 撞索引后回查拿到赢家
        when(paymentMapper.insert(any(Payment.class)))
                .thenThrow(new DuplicateKeyException("uk_payments_order_success"));

        Payment result = service.pay(userId, orderId);

        assertThat(result.getId()).isEqualTo(winner.getId()); // 与并发赢家同笔，语义等同幂等
        org.mockito.Mockito.verify(orderCommand, org.mockito.Mockito.never()).markPaid(any());
    }
}
