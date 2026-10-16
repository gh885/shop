package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderStatus;
import java.util.UUID;

/**
 * 结算批次里单笔订单的支付视图（payment 合并支付用）：一次 checkout_key 下的每张单一条。
 * 与 {@link OrderPaymentView} 的差别只在多带 {@code orderId}——整批发起/确认要按单落流水、逐单推进状态机，
 * 需要订单主键。归属已由查询的 user_id 谓词圈定，故不再冗余 userId。
 * 状态判定用 {@link #pendingPayment()}，不读 {@link #status()} 自行比字面量。
 */
public record OrderCheckoutLine(UUID orderId, String orderNo, OrderStatus status, Money payAmount) {

    /** 是否待付款（可支付的订单态闸门） */
    public boolean pendingPayment() {
        return status == OrderStatus.PENDING_PAYMENT;
    }
}
