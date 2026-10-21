package com.shop.platform.trade.model;

import java.util.Locale;

/**
 * 订单组的支付维度。
 *
 * <p>**关闭不在这里。** 未付款取消不用退钱，已付款关闭要记冲正；塞进同一个枚举，付款状态就说不清，
 * 而且 CAS 条件、展示态、事件触发者会各写一套。关闭看 {@code closed_at}。
 */
public enum PaymentStatus {
    UNPAID,
    PAID,
    PARTIALLY_REFUNDED,
    REFUNDED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static PaymentStatus from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }

    public boolean hasMoney() {
        return this != UNPAID;
    }
}
