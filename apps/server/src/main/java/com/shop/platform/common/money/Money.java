package com.shop.platform.common.money;

import java.util.Locale;

/**
 * 全链路唯一的金额形状：整数分 + ISO 4217 币种。
 *
 * <p>不要用 {@code long} 裸传金额，也不要用 {@code double}。金额跨模块传递时，币种和数值必须一起走；
 * 只传一个 long，三个月后没人记得它到底是分还是元。
 *
 * <p>价格、优惠、运费、退款都用这个类型。负数的退款/冲正由记账侧用带符号金额表达，不在这里放宽。
 */
public record Money(long amount, String currency) {

    public Money {
        if (amount < 0) {
            throw new IllegalArgumentException("金额不能为负: " + amount);
        }
        if (currency == null || currency.length() != 3) {
            throw new IllegalArgumentException("币种必须是 3 位 ISO 代码: " + currency);
        }
        currency = currency.toUpperCase(Locale.ROOT);
    }

    public static Money cny(long amount) {
        return new Money(amount, "CNY");
    }
}
