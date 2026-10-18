package com.shop.platform.payment.api;

import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.gateway.PaymentGatewayException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import com.shop.platform.payment.service.PaymentChannels;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 渠道退款命令（aftersale 调用）：找到该订单的成功流水 → 按流水自己的渠道提交退款 → 受理后累计已退额。
 *
 * <p><b>失败不抛异常</b>：拒退是一个可重试的事实，退款单要把它落成一条 {@code RefundExecution} 并停在「退款中」，
 * 由重试线决定下一次。真正无法继续的两种情形（查无成功流水、金额超过该笔支付的可退额度）仍抛 409——
 * 那是数据不一致，重试一万次也不会变。
 *
 * <p>受理后条件累计 {@code payment.refunded_amount}：退满才转 REFUNDED，部分退款留在 SUCCESS，
 * 「退了多少」由金额列表达（V81 后的口径，不再整单一次性置 REFUNDED）。
 *
 * <p>本命令不自己开事务之外的东西：调用方（aftersale 退款单）的同事务里执行，账与渠道结果要么一起成立、
 * 要么一起回滚；渠道侧已受理而本地回滚的窗口靠退款单号做幂等键，重试不会退第二次。
 */
@Component
@RequiredArgsConstructor
public class PaymentRefundCommand {

    private final PaymentMapper paymentMapper;

    /** 按流水自己的渠道退款：MOCK 与支付宝的真实实现不同，不能按当前默认渠道挑 */
    private final PaymentChannels paymentChannels;

    public PaymentRefundAttempt refund(PaymentRefund request) {
        // 1. 成功流水是退款的唯一资金来源；没有它说明这笔钱从没到过账
        Payment payment = Validate.notNull(paymentMapper.selectSuccessByOrder(request.orderId()), "该订单没有可退款的支付流水");

        // 2. 币种必须与支付一致：金额是两个半边组成的一笔钱，换币种退的是另一笔
        Validate.isTrue(
                payment.amountAsMoney().currency().equals(request.amount().currency()), "退款币种与支付流水不一致");

        // 3. 提交渠道：退款单号即渠道幂等键，重试不会退第二次
        PaymentGateway.RefundOutcome outcome;
        try {
            outcome = paymentChannels
                    .of(payment.getChannel())
                    .refund(new PaymentGateway.RefundParams(
                            payment.getId(),
                            payment.getOrderId(),
                            payment.getOrderNo(),
                            request.amount(),
                            Text.trimToNull(request.reason()),
                            request.refundNo()));
        } catch (PaymentGatewayException e) {
            // 渠道拒退是对账缺口：留下可聚合的失败事件，退款单侧另有一条执行记录
            BizEvent.of("payment.refund.failed")
                    .put("reason", "gateway_rejected")
                    .put("order_id", payment.getOrderId())
                    .put("refund_no", request.refundNo())
                    .put("error.type", e.getClass().getSimpleName())
                    .put("error.message", e.getMessage())
                    .error(e);
            return new PaymentRefundAttempt(false, null, e.getMessage());
        }

        // 4. 累计已退额：条件更新挡超退，退满才转 REFUNDED
        int changed = paymentMapper.applyRefund(
                payment.getId(), request.amount().amount(), OffsetDateTime.now(), outcome.refundNo());
        Validate.conflict(changed == 1, "退款金额超过该笔支付的可退额度");

        BizEvent.of("payment.refunded")
                .put("order_id", payment.getOrderId())
                .put("refund_no", request.refundNo())
                .put("amount", request.amount())
                .put("gateway_refund_no", outcome.refundNo())
                .emit();
        return new PaymentRefundAttempt(true, outcome.refundNo(), null);
    }
}
