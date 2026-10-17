package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 退款单类型 —— 按「货的去向」划分，数量落点跟着走（docs/domain/order-model.md §4.5）。
 */
@Schema(enumAsRef = true)
public enum RefundType {

    /** 仅退款：退不会再交付的货（未发件，或拒收/拦截后已取消的发货单） */
    REFUND_ONLY,

    /** 退货退款：退已签收、寄回的货 */
    RETURN_REFUND,

    /** 补偿：货留买家、只退钱 */
    COMPENSATION
}
