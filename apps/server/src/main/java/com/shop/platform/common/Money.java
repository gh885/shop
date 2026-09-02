package com.shop.platform.common;

import java.util.Locale;

/**
 * 金额值对象：amount + currency 一体，不可变、无身份、按值比较。
 *
 * <p>amount 以「分」为计量单位（避免浮点误差），currency 为 ISO 4217 币种码（如 CNY）。
 * 单位与币种嵌进类型，而非散成两个孤立字段靠注释维系——这正是「不裸传 int64」要防的场景。
 *
 * <p>业务语义：这是一个商品/交易金额，非负；运算只在同币种间进行，跨币种相加直接拒绝，从编译期之外再多一道运行时护栏。
 */
public record Money(long amount, String currency) {

    /** 常见币种常量。业务侧默认本平台定价货币为 CNY */
    public static final String CNY = "CNY";

    public Money {
        Validate.isTrue(amount >= 0, "金额不能为负");
        Validate.isTrue(currency != null && !currency.isBlank(), "币种不能为空");
        currency = currency.trim().toUpperCase(Locale.ROOT);
    }

    /** 工厂：按「分」构造。金额语义在方法名里说清，调用方不用猜单位 */
    public static Money ofFen(long amount, String currency) {
        return new Money(amount, currency);
    }

    /** 便捷工厂：人民币，按「分」构造 */
    public static Money cny(long amountFen) {
        return new Money(amountFen, CNY);
    }

    /** 相加：仅同币种，跨币种抛业务异常（400），避免把 CNY 和 USD 当一回事 */
    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(this.amount + other.amount, this.currency);
    }

    /** 乘以非负整数倍（如单价 × 数量）。乘法方向明确：结果仍是同币种的金额，单位不漂移 */
    public Money times(long factor) {
        Validate.isTrue(factor >= 0, "金额倍数不能为负");
        return new Money(this.amount * factor, this.currency);
    }

    private void requireSameCurrency(Money other) {
        Validate.isTrue(other != null && this.currency.equals(other.currency), "金额币种不一致，无法运算");
    }
}
