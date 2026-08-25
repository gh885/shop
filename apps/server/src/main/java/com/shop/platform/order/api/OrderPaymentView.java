package com.shop.platform.order.api;

import java.util.UUID;

/**
 * 订单支付视图：orders.orders 的跨模块投影（payment 支付前置校验 + 流水冗余字段）。
 * 状态判定用 {@link #pendingPayment()}，不要读 {@link #status()} 自行比较魔法值。
 */
public record OrderPaymentView(String orderNo, UUID userId, String status, Long payAmount, String currency) {

    /** 待付款状态值，魔法值私有在本模块；消费方用 {@link #pendingPayment()} */
    private static final String STATUS_PENDING_PAYMENT = "PENDING_PAYMENT";

    /** 是否待付款（可支付的订单态闸门） */
    public boolean pendingPayment() {
        return STATUS_PENDING_PAYMENT.equals(status);
    }
}
