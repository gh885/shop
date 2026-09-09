package com.shop.platform.order.api;

import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 订单售后视图：orders.orders 的跨模块投影（aftersale 申请前置校验 + 退款口径来源）。
 * 可否申请用 {@link #afterSaleOpenAt}，不要读 {@link #status()} 自行比较字面量——状态词表归 order 模块，消费方只吃谓词。
 */
public record OrderAfterSaleView(
        UUID userId, UUID shopId, OrderStatus status, OffsetDateTime applyExpireAt, Long payAmount, String currency) {

    /** 售后申请窗口是否开着：已完成（确认收货 / 自动收货）且申请截止未过 */
    public boolean afterSaleOpenAt(OffsetDateTime now) {
        return status == OrderStatus.COMPLETED && applyExpireAt != null && applyExpireAt.isAfter(now);
    }
}
