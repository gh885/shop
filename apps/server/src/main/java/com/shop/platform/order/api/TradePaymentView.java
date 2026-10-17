package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.TradeStatus;
import java.util.List;
import java.util.UUID;

/**
 * 主订单支付视图：orders.trades 的跨模块投影 + 其下子订单的应付明细。
 *
 * <p>payment 按它发起/确认整批支付：金额以主订单为准，子订单行只回答「这一批要分别推进哪几张单」。
 * 状态判定用 {@link #pendingPayment()}，不读 {@link #status()} 自行比字面量。
 */
public record TradePaymentView(
        UUID tradeId, String tradeNo, UUID userId, TradeStatus status, Money payAmount, List<TradePaymentLine> orders) {

    /** 是否待支付（可发起/确认支付的闸门） */
    public boolean pendingPayment() {
        return status == TradeStatus.PENDING_PAYMENT;
    }

    /** 单张子订单的应付：渠道流水仍按子订单各记一条，金额不重算 */
    public record TradePaymentLine(UUID orderId, String orderNo, Money payAmount) {}
}
