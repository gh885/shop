package com.shop.platform.order.api;

import com.shop.platform.order.model.OrderStatus;
import java.util.UUID;

/**
 * 订单支付视图：orders.orders 的跨模块投影（payment 支付前置校验 + 流水冗余字段）。
 * 状态判定用 {@link #pendingPayment()}，不要读 {@link #status()} 自行比较字面量 ——
 * 状态词表归 order 模块（{@link OrderStatus}），消费方只吃谓词。
 */
public record OrderPaymentView(String orderNo, UUID userId, String status, Long payAmount, String currency) {

    /** 是否待付款（可支付的订单态闸门） */
    public boolean pendingPayment() {
        return OrderStatus.PENDING_PAYMENT.name().equals(status);
    }
}
