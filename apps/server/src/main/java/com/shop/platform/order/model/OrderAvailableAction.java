package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 子订单可执行动作 —— 状态机出边 ∩ 角色权限，也是订单按钮组的唯一真相。
 *
 * <p>支付不在这里：付款是主订单的动作（一次支付覆盖多个子订单），由收银台与 {@link TradeStatus} 负责；
 * 子订单创建即处于待发货，买家在子订单上的动作只有取消与确认收货。
 */
@Schema(enumAsRef = true)
public enum OrderAvailableAction {

    /** 取消订单（待发货 → 已取消，回补冻结库存） */
    CANCEL(OrderStatus.CANCELLED),

    /** 发货（待发货/部分发货/已发货 → 已发货；已发货单上语义 = 追加包裹，仅卖家视角） */
    SHIP(OrderStatus.SHIPPED),

    /** 确认收货（已发货 → 已完成） */
    RECEIVE(OrderStatus.COMPLETED);

    private final OrderStatus target;

    OrderAvailableAction(OrderStatus target) {
        this.target = target;
    }

    /** 本动作的落点状态（必须出现在 {@link OrderStatus} 的转移表出边里） */
    public OrderStatus target() {
        return target;
    }
}
