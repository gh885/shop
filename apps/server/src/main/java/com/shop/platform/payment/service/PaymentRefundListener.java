package com.shop.platform.payment.service;

import com.shop.platform.aftersale.events.AfterSaleRefundedEvent;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.observability.BizEvent;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.payment.gateway.PaymentGateway;
import com.shop.platform.payment.gateway.PaymentGatewayException;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.mapper.PaymentMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 退款监听 —— order（已付款单取消）与 aftersale（售后退款）两条「该退钱了」的通知，先经 {@link PaymentGateway#refund} 提交给渠道，
 * 渠道受理后再把成功流水置 REFUNDED（退款单成为真资产，不再只是改状态）。
 * 一律同步同事务（{@code @EventListener} 而非 AFTER_COMMIT）：退款写不成就让订单侧一起回滚。
 *
 * <p>两条通知对「无流水可退 / 渠道拒退」的取舍刻意不同：
 * <ul>
 *   <li><b>已付款单取消</b>：放行并告警——取消是买家的既得权利，不能因为对不上流水把订单卡在待发货，
 *       退款差对走 {@code payment.refund.failed} 事件日志与人工对账。</li>
 *   <li><b>售后同意</b>：抛异常回滚——售后是双方可协商的流程，停回「申请中」由人工处理，
 *       比在订单上假报「已退款」诚实。</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
public class PaymentRefundListener {

    private final PaymentMapper paymentMapper;

    private final PaymentGateway paymentGateway;

    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        Payment success = paymentMapper.selectSuccessByOrder(event.orderId());
        if (success == null) {
            // 对账缺口埋点（事件规范 docs/conventions/business-event-logging.md）：放行的退款失败必须留下可聚合的 event
            BizEvent.of("payment.refund.failed")
                    .put("reason", "no_success_payment")
                    .put("order_id", event.orderId())
                    .put("user_id", event.userId())
                    .error();
            return;
        }
        // 渠道拒退也不在这里另报：backendRefund 的放行分支已经埋过 payment.refund.failed，
        // 调用点再打一句「已退款」就是假报
        backendRefund(success, "订单取消退款", false, event.userId());
    }

    @EventListener
    public void onAfterSaleRefunded(AfterSaleRefundedEvent event) {
        Payment success = Validate.notNull(paymentMapper.selectSuccessByOrder(event.orderId()), "该订单没有可退款的支付流水");
        backendRefund(success, "售后退款", true, event.userId());
    }

    /**
     * 提交渠道退款并落本地退款单，成败各埋一条事件（{@code payment.refunded} / {@code payment.refund.failed}）——
     * 钱出去了这个动作本身就是对账依据，两条通知共用这一个出口，字段口径才不会分叉。
     *
     * <p>拒退时按 {@code strict} 取舍：{@code false}=放行人工对账（取消），{@code true}=抛异常回滚（售后）。
     *
     * @param reason 送渠道的退款原因文案，两条通知各报自己的场景（对账时看得懂这笔钱为什么退）
     * @param userId 事件里的 user_id，可为 null
     */
    private void backendRefund(Payment success, String reason, boolean strict, UUID userId) {
        PaymentGateway.RefundOutcome outcome;
        try {
            outcome = paymentGateway.refund(new PaymentGateway.RefundParams(
                    success.getId(), success.getOrderId(), success.getOrderNo(), success.amountAsMoney(), reason));
        } catch (PaymentGatewayException e) {
            if (strict) {
                throw e;
            }
            // 放行分支同样是对账缺口：埋失败事件，reason=gateway_rejected，error.* 按规范带上渠道异常
            BizEvent.of("payment.refund.failed")
                    .put("reason", "gateway_rejected")
                    .put("order_id", success.getOrderId())
                    .put("user_id", userId)
                    .put("error.type", e.getClass().getSimpleName())
                    .put("error.message", e.getMessage())
                    .error(e);
            return;
        }
        paymentMapper.refundByOrder(success.getOrderId(), OffsetDateTime.now(), outcome.refundNo());
        // 金额以 Money 形状进事件：amount 与 currency 拆成两格就会有人只抄到一半
        BizEvent.of("payment.refunded")
                .put("order_id", success.getOrderId())
                .put("user_id", userId)
                .put("amount", success.amountAsMoney())
                .put("refund_no", outcome.refundNo())
                .emit();
    }
}
