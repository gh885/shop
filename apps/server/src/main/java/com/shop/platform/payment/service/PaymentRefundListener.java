package com.shop.platform.payment.service;

import com.shop.platform.common.Money;
import com.shop.platform.common.Validate;
import com.shop.platform.order.events.OrderAfterSaleRefundedEvent;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.gateway.PaymentGatewayException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 退款监听 —— order 侧两条「该退钱了」的通知，先经 {@link PaymentGateway#refund} 提交给渠道，
 * 渠道受理后再把成功流水置 REFUNDED（退款单成为真资产，不再只是改状态）。
 * 一律同步同事务（{@code @EventListener} 而非 AFTER_COMMIT）：退款写不成就让订单侧一起回滚。
 *
 * <p>两条通知对「无流水可退 / 渠道拒退」的取舍刻意不同：
 * <ul>
 *   <li><b>已付款单取消</b>：放行并告警——取消是买家的既得权利，不能因为对不上流水把订单卡在待发货，
 *       退款差对走日志与人工对账。</li>
 *   <li><b>售后同意</b>：抛异常回滚——售后是双方可协商的流程，停回「申请中」由人工处理，
 *       比在订单上假报「已退款」诚实。</li>
 * </ul>
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PaymentRefundListener {

    private final PaymentMapper paymentMapper;

    private final PaymentGateway paymentGateway;

    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        Payment success = paymentMapper.selectSuccessByOrder(event.orderId());
        if (success == null) {
            log.error("[PAYMENT] 已付款订单取消但无成功流水可退, orderId={}, userId={}", event.orderId(), event.userId());
            return;
        }
        String refundNo = backendRefund(success, "订单取消退款", false);
        if (refundNo == null) {
            return; // 渠道拒退且不阻塞取消：失败已在 backendRefund 里打过 ERROR，这里不能再报「已退款」
        }
        log.info("[PAYMENT] 订单取消退款, orderId={}, userId={}, refundNo={}", event.orderId(), event.userId(), refundNo);
    }

    @EventListener
    public void onOrderAfterSaleRefunded(OrderAfterSaleRefundedEvent event) {
        Payment success = Validate.notNull(paymentMapper.selectSuccessByOrder(event.orderId()), "该订单没有可退款的支付流水");
        String refundNo = backendRefund(success, "售后退款", true);
        log.info(
                "[PAYMENT] 售后退款到账, orderId={}, userId={}, amount={}, refundNo={}",
                event.orderId(),
                event.userId(),
                event.refundAmount(),
                refundNo);
    }

    /**
     * 提交渠道退款并落本地退款单。渠道拒退时按 {@code strict} 取舍：{@code false}=放行人工对账（取消），
     * {@code true}=抛异常回滚（售后）。
     *
     * @return 渠道侧退款单号（对账凭据）；放行的失败返回 null。不能读 {@code success.getRefundGatewayNo()}
     *     ——refundByOrder 是条件更新语句，不回写内存实体，那里恒为退款前的 null
     */
    private String backendRefund(Payment success, String reason, boolean strict) {
        PaymentGateway.RefundOutcome outcome;
        try {
            outcome = paymentGateway.refund(new PaymentGateway.RefundParams(
                    success.getId(),
                    success.getOrderId(),
                    success.getOrderNo(),
                    Money.ofFen(success.getAmount(), success.getCurrency()),
                    reason));
        } catch (PaymentGatewayException e) {
            if (strict) {
                throw e;
            }
            log.error("[PAYMENT] 渠道退款失败但不阻塞取消, orderId={}, reason={}", success.getOrderId(), reason, e);
            return null;
        }
        paymentMapper.refundByOrder(success.getOrderId(), OffsetDateTime.now(), outcome.refundNo());
        return outcome.refundNo();
    }
}
