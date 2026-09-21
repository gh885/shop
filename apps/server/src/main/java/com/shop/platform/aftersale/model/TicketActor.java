package com.shop.platform.aftersale.model;

/** 售后动作的发起方 —— 落在 aftersale.ticket_events.actor 上 */
public enum TicketActor {

    /** 买家 */
    BUYER,

    /** 卖家 */
    SELLER,

    /** 超时定时任务（售后侧 Closer）：动作不是人做的，时间线不撒谎，不冒充 SELLER/BUYER */
    SYSTEM
}
