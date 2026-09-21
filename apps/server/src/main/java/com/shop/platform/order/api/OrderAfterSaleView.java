package com.shop.platform.order.api;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 订单售后视图：orders.orders 的跨模块投影（aftersale 申请前置校验 + 退款口径来源）。
 * 可否申请用 {@link #afterSaleOpenAt}，不要读 {@link #status()} 自行比较字面量——状态词表归 order 模块，消费方只吃谓词。
 */
public record OrderAfterSaleView(
        UUID userId, UUID shopId, OrderStatus status, OffsetDateTime applyExpireAt, Money payAmount) {

    /** 售后申请窗口是否开着：待收货（货在路上/已签收未确认）随时可申；完成后按申请截止时刻 */
    public boolean afterSaleOpenAt(OffsetDateTime now) {
        return switch (status) {
            case SHIPPED -> true;
            case COMPLETED -> applyExpireAt != null && applyExpireAt.isAfter(now);
            default -> false;
        };
    }
}
