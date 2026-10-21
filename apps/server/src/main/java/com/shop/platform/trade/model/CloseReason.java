package com.shop.platform.trade.model;

import java.util.Locale;

/**
 * 关闭原因。与 {@code closed_at} 同生同死——数据库 {@code ck_group_close} 拦着。
 *
 * <p>{@code merchant_out_of_stock} 是现实里的高频路径：没有这个值，运营只能手填一个不准确的
 * {@code buyer_cancelled}，然后统计里"买家主动取消"永远偏高。
 */
public enum CloseReason {
    BUYER_CANCELLED,
    TIMEOUT,
    PLATFORM_FORCED,
    REFUNDED,
    MERCHANT_OUT_OF_STOCK;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static CloseReason from(String value) {
        return value == null ? null : valueOf(value.toUpperCase(Locale.ROOT));
    }

    /** 子单只允许这四种；{@code platform_forced} 是组级动作。 */
    public boolean appliesToSellerOrder() {
        return this != PLATFORM_FORCED;
    }
}
