package com.shop.platform.payment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.order.api.OrderCommand;
import com.shop.platform.order.api.OrderPaymentView;
import com.shop.platform.order.api.OrderReadQuery;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 支付业务：发起支付（V1 MOCK 即时成功）。
 *
 * <p>事务约定：流水落库与 OrderCommand.markPaid 同事务，order :: api 同步调用推进状态机；
 * 订单已被取消/支付时命令方抛 409，本事务整体回滚——不存在"钱付了单没了"。幂等由
 * uk_payments_order_success 部分唯一索引兜底，连点/并发重试无害。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentMapper paymentMapper;

    private final OrderReadQuery orderReadQuery;

    private final OrderCommand orderCommand;

    /**
     * 发起支付并即时成功（MOCK）。
     *
     * <p>接真实网关时：此处改为创建 PENDING 流水 + 返回收银台跳转参数，回调验签后再置 SUCCESS 并推状态机，
     * 幂等/竞态防护逻辑不变。
     */
    @Transactional
    public Payment pay(UUID userId, UUID orderId) {
        // 1. 只读点查订单（order :: api）：存在、属于本人、待付款才可支付；金额以订单投影为准，不信前端
        OrderPaymentView order =
                orderReadQuery.paymentViewById(orderId).orElseThrow(() -> BusinessException.notFound("订单不存在"));
        Validate.isTrue(order.userId().equals(userId), "订单不存在");

        // 2. 幂等短路在前：已存在成功流水直接返回——重试/连点/订单已支付都回到同一笔流水，不报错
        Payment existing = paymentMapper.selectOne(successOfOrder(orderId));
        if (existing != null) {
            return existing;
        }

        // 3. 未付过才要求待付款态；非待付款（如已取消）拒绝支付
        Validate.isTrue(order.pendingPayment(), 409, "订单不是待付款状态");

        // 4. 写成功流水（MOCK 渠道即时成功），部分唯一索引是并发重复支付的硬兜底
        Payment payment = Payment.builder()
                .orderId(orderId)
                .orderNo(order.orderNo())
                .userId(userId)
                .amount(order.payAmount())
                .currency(order.currency())
                .channel(Payment.CHANNEL_MOCK)
                .status(Payment.STATUS_SUCCESS)
                .paidAt(OffsetDateTime.now())
                .build();
        try {
            paymentMapper.insert(payment);
        } catch (DuplicateKeyException e) {
            // 并发窗口内另一请求先落了流水：退回既有成功流水，语义等同幂等重试
            return Validate.notNull(paymentMapper.selectOne(successOfOrder(orderId)), "支付流水写入冲突");
        }

        // 5. 同步调用 order :: api 推进 PENDING_PAYMENT → PAID；失败抛 409 连带回滚本流水
        orderCommand.markPaid(orderId);
        log.info("[PAYMENT] 支付成功, orderId={}, userId={}, amount={}", orderId, userId, order.payAmount());
        return payment;
    }

    private static LambdaQueryWrapper<Payment> successOfOrder(UUID orderId) {
        return new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderId, orderId)
                .eq(Payment::getStatus, Payment.STATUS_SUCCESS);
    }
}
