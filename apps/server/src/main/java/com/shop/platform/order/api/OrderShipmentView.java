package com.shop.platform.order.api;

import com.shop.platform.order.model.OrderStatus;
import java.util.UUID;

/**
 * 订单发货视图：orders.orders 的跨模块投影（logistics 发货前置校验）。
 * 可否发货用 {@link #shippable()} / 是否首次发货用 {@link #pendingShipment()}，
 * 不要读 {@link #status()} 自行比较字面量——状态词表归 order 模块，消费方只吃谓词。
 */
public record OrderShipmentView(UUID orderId, UUID userId, UUID shopId, OrderStatus status) {

    /** 可发货：待发货（首次发货）或已发货（追加包裹）；已取消/已完成不可再发 */
    public boolean shippable() {
        return status == OrderStatus.PAID || status == OrderStatus.SHIPPED;
    }
}
