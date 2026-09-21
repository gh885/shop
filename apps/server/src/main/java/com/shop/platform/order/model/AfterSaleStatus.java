package com.shop.platform.order.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 订单上的售后投影 —— 最近一张售后单的状态，由 aftersale 模块每次转移后经 order :: api 写回
 * （{@code OrderCommand.syncAfterSale}），供订单列表/详情展示；{@link #NONE} = 从未申请过售后。
 * 售后单本体、转移表与时间线在 aftersale 模块（aftersale.tickets），本枚举不再承载状态机。
 * 除 NONE 外与 aftersale 的 TicketStatus 同词表，DB 列存 {@code name()}。
 */
@Schema(enumAsRef = true)
public enum AfterSaleStatus {

    /** 无售后（默认） */
    NONE,

    /** 售后申请中（卖家待处理） */
    APPLYING,

    /** 退货退款进行中：卖家已同意，等待买家回寄、卖家收货（仅退货退款路径） */
    RETURNING,

    /** 已退款（终态） */
    REFUNDED,

    /** 卖家已拒绝（终态） */
    REJECTED,

    /** 买家撤销售后申请（终态） */
    CLOSED;

    /** 争议未决（售后单还挂着）：此时系统不该替买家宣布「已收货」 */
    public boolean unresolved() {
        return this == APPLYING || this == RETURNING;
    }
}
