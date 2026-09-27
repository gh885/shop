package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 审计动作语汇 —— 落在 orders.order_status_log.action 上的「这次转移是什么动作」。
 * 状态是后端语汇（{@link OrderStatus}），动作是业务语汇：
 * 同一个目标态可以由不同动作到达（买家取消 CANCEL 与超时关单 AUTO_CANCEL 都到 CANCELLED），
 * 靠这一列区分，回放历史时才说得清"谁按了什么"。售后动作的时间线在 aftersale.ticket_events，不在此处。
 */
@Schema(enumAsRef = true)
public enum OrderAction {

    /** 下单落库（无前态） */
    CREATE,

    /** 支付成功 */
    PAY,

    /** 买家取消 */
    CANCEL,

    /** 系统自动取消（只有待付款超时关单这一条路；已付款单没有系统取消，见 ORD-60） */
    AUTO_CANCEL,

    /** 卖家发货 */
    SHIP,

    /** 买家确认收货 */
    RECEIVE,

    /** 系统自动确认收货（已发货超时未确认） */
    AUTO_RECEIVE
}
