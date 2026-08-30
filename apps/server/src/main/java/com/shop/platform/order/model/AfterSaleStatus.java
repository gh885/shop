package com.shop.platform.order.model;

/**
 * 售后状态机 —— 与履约主状态机（{@link OrderStatus}）正交的第二条线，接管「履约完成之后的交易纠葛」。
 * 主状态停在 COMPLETED 不再动，售后只在本线上流转。本枚举只声明<b>状态集</b>；
 * 合法转移（谁从哪到哪、附带什么副作用）的唯一真相在 {@link AfterSaleAction}（它就是那张转移表）。
 *
 * <p>两条售后路径：仅退款（货不退，卖家同意即退款）；退货退款（货要退回，
 * 卖家同意后进入 {@link #RETURNING} 等待回寄与收货，收货确认后才退款并回补库存）。
 * DB 列存 {@code name()}。
 */
public enum AfterSaleStatus {

    /** 无售后（默认） */
    NONE,

    /** 售后申请中（卖家待处理） */
    APPLYING,

    /** 退货退款进行中：卖家已同意，等待买家回寄、卖家收货（仅退货退款路径） */
    RETURNING,

    /** 已退款（终态；仅退款与退货退款收货确认后都到这儿） */
    REFUNDED,

    /** 卖家已拒绝（终态） */
    REJECTED,

    /** 买家撤销售后申请（终态） */
    CLOSED;
}
