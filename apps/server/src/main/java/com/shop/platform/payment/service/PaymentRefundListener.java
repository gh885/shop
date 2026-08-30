package com.shop.platform.payment.service;

import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.payment.mapper.PaymentMapper;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 订单取消 → 退款单据监听：已付款订单取消时，在取消事务内同步把成功流水转 REFUNDED ——
 * 取消与退款单据原子生效，不会出现「订单已取消、货款却还挂在 SUCCESS」。
 *
 * <p>未付款取消（{@code wasPaid = false}）没有成功流水，直接跳过。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PaymentRefundListener {

    private final PaymentMapper paymentMapper;

    /**
     * 同步同事务（{@code @EventListener} 而非 AFTER_COMMIT）：退款写不成就让取消一起回滚。
     *
     * <p>影响 0 行 = 订单是 PAID 却查不到成功流水，属数据已损坏（程序缺陷或人工改库）。此处
     * <b>只报 error 不抛异常</b>：阻断取消并不能把丢失的流水变回来，只会让买家卡在无法取消的单子上；
     * 库存回补与关单是独立且正确的行为，应当放行。不一致由日志暴露、走人工对账。
     */
    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        if (!event.wasPaid()) {
            return;
        }
        int refunded = paymentMapper.refundByOrder(event.orderId(), OffsetDateTime.now());
        if (refunded == 0) {
            log.error("[PAYMENT] 已付款订单取消但无成功流水可退, orderId={}, userId={}", event.orderId(), event.userId());
            return;
        }
        log.info("[PAYMENT] 订单取消退款, orderId={}, userId={}", event.orderId(), event.userId());
    }
}
