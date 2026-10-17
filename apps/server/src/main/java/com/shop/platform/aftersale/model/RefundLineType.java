package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 退款单行类型 —— 决定这行钱的落账去向（docs/domain/order-model.md §4.5）。
 */
@Schema(enumAsRef = true)
public enum RefundLineType {

    /** 商品行：挂订单行，计入 refunded_amount 与 refunded_quantity */
    ITEM,

    /** 运费行：子订单全退时整笔退 shipping_fee，不占可退数量 */
    SHIPPING,

    /** 补偿行：货留买家只退钱，计入 compensated_amount，不占可退数量 */
    COMPENSATION
}
