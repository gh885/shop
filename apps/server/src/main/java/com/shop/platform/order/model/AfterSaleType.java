package com.shop.platform.order.model;

/**
 * 售后类型。V1 只做仅退款（货不退、无库存回补）；退货退款涉及退货物流与收货确认，
 * 到真做时再加常量 + 放宽 DB CHECK，不预留占位。DB 列存 {@code name()}。
 */
public enum AfterSaleType {

    /** 仅退款：买家保留商品，只退钱，无库存回补 */
    REFUND_ONLY
}
