package com.shop.platform.order.model;

/** 状态转移的发起方 —— 落在 orders.order_status_log.actor_type 上，与动作正交（同一动作可由不同角色发起）。 */
public enum OrderActor {

    /** 买家 */
    BUYER,

    /** 卖家 */
    SELLER,

    /** 系统（定时任务等无人值守路径） */
    SYSTEM
}
