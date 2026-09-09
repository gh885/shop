package com.shop.platform.aftersale.model;

import io.swagger.v3.oas.annotations.media.Schema;

/** 售后类型。DB 列存 {@code name()}，CHECK 约束紧跟在 {@link #values()}（迁移同步）。 */
@Schema(enumAsRef = true)
public enum TicketType {

    /** 仅退款：买家保留商品，只退钱，无库存回补（卖家同意即退款完成） */
    REFUND_ONLY,

    /** 退货退款：买家寄回商品、卖家确认收货后退款并回补库存（中间态 RETURNING） */
    RETURN_REFUND
}
