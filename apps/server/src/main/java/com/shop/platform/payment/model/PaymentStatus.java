package com.shop.platform.payment.model;

import java.util.Locale;

/**
 * 支付单状态。
 *
 * <p>{@code closed} 是超时关掉的，{@code failed} 是渠道明确拒的。分开记：一个是没人付，一个是付了但没成。
 */
public enum PaymentStatus {
    PENDING,
    SUCCESS,
    FAILED,
    CLOSED,
    REFUNDED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static PaymentStatus from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }

    /** 还能收到有效回调的状态。已终态的再来回调只记不入账。 */
    public boolean acceptsCallback() {
        return this == PENDING;
    }
}
