package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 售后单状态集。合法转移（谁从哪到哪）的唯一真相在 {@link TicketAction}（它就是那张转移表），本枚举只声明状态；
 * 两条路径各自的退款与回补时机见 {@link TicketType}。DB 列存 {@code name()}。
 */
@Schema(enumAsRef = true)
public enum TicketStatus {

    /** 申请中（卖家待处理） */
    APPLYING,

    /** 退货退款进行中：卖家已同意，等待买家回寄、卖家收货（仅退货退款路径） */
    RETURNING,

    /** 已退款（终态；仅退款与退货退款收货确认后都到这儿） */
    REFUNDED,

    /** 卖家已拒绝（终态） */
    REJECTED,

    /** 买家撤销申请（终态） */
    CLOSED;

    /** 是否进行中（未到终态）：同一订单同一时刻至多一张进行中的单 */
    public boolean open() {
        return this == APPLYING || this == RETURNING;
    }
}
