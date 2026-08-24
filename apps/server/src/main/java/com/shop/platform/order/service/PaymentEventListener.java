package com.shop.platform.order.service;

import com.shop.platform.payment.events.PaymentSucceededEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 支付结果监听：payment 模块在写流水的事务内发布 PaymentSucceededEvent，
 * 同步同事务消费——订单推进到 PAID 失败（已取消/已支付）则支付流水一并回滚。
 * 不用 AFTER_COMMIT：资金状态两侧必须原子。
 */
@Component
@RequiredArgsConstructor
public class PaymentEventListener {

    private final OrderService orderService;

    @EventListener
    public void onPaid(PaymentSucceededEvent event) {
        orderService.markPaid(event.orderId());
    }
}
