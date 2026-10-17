package com.shop.platform.order.api;

import com.shop.platform.order.model.OrderStatus;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 订单发货视图：orders.orders 的跨模块投影（logistics 发货前置校验）。
 * 可否发货用 {@link #shippable()}，不要读 {@link #status()} 自行比较字面量——状态词表归 order 模块，消费方只吃谓词。
 *
 * <p>子订单创建即 PAID（待发货），所以「待发货」本身不代表付过钱：{@code paid_at} 为空时禁止发货
 * （docs/domain/order-model.md §4.2）。
 */
public record OrderShipmentView(UUID orderId, UUID userId, UUID shopId, OrderStatus status, OffsetDateTime paidAt) {

    /** 可发货：已付款，且待发货（首次）或已发货（追加包裹）；已取消/已完成/未支付都不可发 */
    public boolean shippable() {
        return paidAt != null && (status == OrderStatus.PAID || status == OrderStatus.SHIPPED);
    }
}
