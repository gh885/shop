package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 订单可执行动作 —— 状态机出边 ∩ 角色权限，也是订单按钮组的唯一真相。
 *
 * <p>为什么从裸字符串提成枚举：动作名原先藏在 {@code Map<OrderStatus, String>} 里，出参是
 * {@code List<String>}，OpenAPI 只能生成 {@code string[]}，于是前端按状态又推了一遍按钮表
 * （两处真相，且已经漂移：后端认为待发货的买家可 CANCEL，前端只给了「提醒发货」）。
 * 提成枚举后 SDK 生成联合类型，前端消费后端给的动作集，只保留文案与展示顺序。
 *
 * <p>{@link #target()} 是动作表与转移表（{@link OrderStatus} 的 TRANSITIONS）的接头：
 * 一个动作可用 = 目标态是当前态的出边，且该目标属于此角色。
 */
@Schema(enumAsRef = true)
public enum OrderAvailableAction {

    /** 付款（待付款 → 待发货） */
    PAY(OrderStatus.PAID),

    /** 取消订单（待付款/待发货 → 已取消，回补库存） */
    CANCEL(OrderStatus.CANCELLED),

    /** 发货（待发货 → 已发货；仅卖家视角） */
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
