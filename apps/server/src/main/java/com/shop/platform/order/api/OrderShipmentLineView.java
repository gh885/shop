package com.shop.platform.order.api;

import java.util.UUID;

/**
 * 订单行发货视图：logistics 发货守卫与发货单行的前置校验用。
 *
 * <p>{@code settledQuantity} 是履约判定的唯一输入（发出去的 + 退掉的），发货守卫
 * {@code settled + 本次发货量 ≤ quantity} 读它（docs/domain/order-model.md §8）。
 */
public record OrderShipmentLineView(UUID orderItemId, int quantity, int shippedQuantity, int settledQuantity) {

    /** 本行还能再发多少件：已结清的量（发过 + 退过）不再重复发 */
    public int shippableQuantity() {
        return quantity - settledQuantity;
    }
}
