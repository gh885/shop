package com.shop.platform.order.api;

import java.time.OffsetDateTime;

/**
 * 发货事实（logistics → order，同事务传入）：子订单履约态重算只认这三个结论，
 * order 不反向读物流表（docs/domain/order-model.md §8）。
 *
 * @param hasEverShipped 是否产生过发货（至少一张已发出且未取消的正向包裹）
 * @param allShipmentsDelivered 未取消的正向包裹是否已全部签收；没有包裹时为 false
 * @param lastDeliveredAt 最后一张包裹的签收时刻，{@code allShipmentsDelivered} 为 false 时为 null
 */
public record OrderFulfillmentFacts(
        boolean hasEverShipped, boolean allShipmentsDelivered, OffsetDateTime lastDeliveredAt) {

    /** 发货前 / 取消到零的兜底事实：没发过、也没签收过 */
    public static OrderFulfillmentFacts none() {
        return new OrderFulfillmentFacts(false, false, null);
    }
}
