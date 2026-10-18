package com.shop.platform.aftersale.service;

import com.shop.platform.order.events.OrderCancelledEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 已付款订单取消 → 自动整单退款（同事务，同步监听）。
 *
 * <p>取消是买家的既得权利（ORD-20），退款单必须随之落地：订单取消后这笔钱要么已退回、要么停在「退款中」
 * 由重试线追。事件只带订单与买家——退款金额、行、运费全部由 aftersale 经 order :: api 现查，
 * 事件不带钱，就不会出现「事件里的金额与账本对不上」的第二份真相。
 */
@Component
@RequiredArgsConstructor
public class OrderCancelledListener {

    private final RefundService refundService;

    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        refundService.refundCancelledOrder(event.orderId(), event.userId());
    }
}
