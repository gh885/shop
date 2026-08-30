package com.shop.platform.payment.service;

import com.shop.platform.common.Validate;
import com.shop.platform.order.events.OrderAfterSaleRefundedEvent;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.payment.mapper.PaymentMapper;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 退款监听 —— order 侧两条「该退钱了」的通知落成退款单据（成功流水 → REFUNDED）。
 * 一律同步同事务（{@code @EventListener} 而非 AFTER_COMMIT）：退款写不成就让订单侧一起回滚。
 *
 * <p>两条通知对「无流水可退」的取舍刻意不同，见各方法注释。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PaymentRefundListener {

    private final PaymentMapper paymentMapper;

    /**
     * 已付款订单取消：把成功流水转 REFUNDED。
     *
     * <p>无流水可退时<b>放行并告警</b>：取消是买家的既得权利，不能因为对不上流水把订单卡在待发货
     * （对账靠日志与 payment 侧巡检）。V1 MOCK 渠道只置状态，接真实网关后此处改为调退款 API + 落退款单。
     */
    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        if (refund(event.orderId()) == 0) {
            log.error("[PAYMENT] 已付款订单取消但无成功流水可退, orderId={}, userId={}", event.orderId(), event.userId());
            return;
        }
        log.info("[PAYMENT] 订单取消退款, orderId={}, userId={}", event.orderId(), event.userId());
    }

    /**
     * 售后同意退款：把成功流水转 REFUNDED。
     *
     * <p>无流水可退时<b>抛异常回滚</b>：售后是可反复协商的流程，让它停回「申请中」由人工处理，
     * 比在订单上假报「已退款」诚实。与取消相反的取舍——那边不能卡死买家，这边不能凭空宣告退款。
     */
    @EventListener
    public void onOrderAfterSaleRefunded(OrderAfterSaleRefundedEvent event) {
        Validate.isTrue(refund(event.orderId()) > 0, 409, "该订单没有可退款的支付流水");
        log.info(
                "[PAYMENT] 售后退款到账, orderId={}, userId={}, amount={}",
                event.orderId(),
                event.userId(),
                event.refundAmount());
    }

    /** 成功流水 → REFUNDED，返回影响行数（0 = 无流水可退） */
    private int refund(UUID orderId) {
        return paymentMapper.refundByOrder(orderId, OffsetDateTime.now());
    }
}
