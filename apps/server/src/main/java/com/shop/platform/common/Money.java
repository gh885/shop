package com.shop.platform.common;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import java.util.Locale;

/**
 * 金额值对象：amount + currency 一体，不可变、无身份、按值比较。
 *
 * <p>amount 以「分」为计量单位（避免浮点误差），currency 为 ISO 4217 币种码（如 CNY）。
 * 单位与币种嵌进类型，而非散成两个孤立字段靠注释维系——这正是「不裸传 int64」要防的场景。
 *
 * <p><b>全链路唯一金额类型</b>：入参、出参、跨模块 api 视图都用它，只有 mapper 实体按列存
 * （{@code long} 分 + {@code currency} 列），由实体派生方法换算成 Money。所以「哪儿该是 Money」
 * 不需要判断：不在 mapper 包、又是金额的，就是 Money——ArchUnit 与契约审计各挡一道。
 *
 * <p>业务语义：这是一个商品/交易金额，非负；运算只在同币种间进行，跨币种相加直接拒绝，从编译期之外再多一道运行时护栏。
 */
public record Money(
        @Schema(requiredMode = REQUIRED) @Min(0) long amount, @Schema(requiredMode = REQUIRED) String currency) {

    /** 常见币种常量。业务侧默认本平台定价货币为 CNY */
    public static final String CNY = "CNY";

    public Money {
        if (amount < 0) {
            throw new IllegalStateException("金额不能为负");
        }
        if (currency == null || currency.isBlank()) {
            throw new IllegalStateException("币种不能为空");
        }
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

    /** 可空工厂：金额列为 null（未定价/未退款等）时透传 null，非空按「分」构造 */
    public static Money ofFenOrNull(Long amountFen, String currency) {
        return amountFen == null ? null : ofFen(amountFen, currency);
    }

    /**
     * 零金额：聚合的起点、以及「这一项没有钱」的表达。
     *
     * <p>币种由调用方从旁边的钱里拿（{@code itemAmount.currency()}），而不是在这里替平台决定——
     * 零也是有个币种的零，凭空造一个 CNY 等于让「零运费」混进非 CNY 的单子。
     */
    public static Money zero(String currency) {
        return new Money(0, currency);
    }

    /**
     * 入参护栏：币种必须是平台定价币种，否则 400（原对象返回自己，方便嵌进构造器）。
     *
     * <p>「一期只有 CNY」这件事在 DB 侧以 {@code CHECK (currency = 'CNY')} 钉死，但那道闸门撞上就是
     * 500；入参先挡一次，卖家收到的是「填错了」而不是「服务器坏了」。
     */
    public Money requirePlatformCurrency() {
        Validate.isTrue(CNY.equals(currency), "暂不支持 " + CNY + " 之外的定价币种");
        return this;
    }

    /** 相加：仅同币种，跨币种说明内部不变量被破坏 */
    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(this.amount + other.amount, this.currency);
    }

    /** 乘以非负整数倍（如单价 × 数量）。乘法方向明确：结果仍是同币种的金额，单位不漂移 */
    public Money times(long factor) {
        if (factor < 0) {
            throw new IllegalStateException("金额倍数不能为负");
        }
        return new Money(this.amount * factor, this.currency);
    }

    /**
     * 是否不小于另一笔钱（门槛判定、封顶取值都用它）。跨币种说明内部不变量被破坏，
     * 静默给个比较结果比报错贵。
     */
    public boolean atLeast(Money other) {
        requireSameCurrency(other);
        return this.amount >= other.amount;
    }

    /**
     * 相减：仅同币种。结果不得为负 —— 本类型语义是「交易金额」，负值没有意义
     * （订单应付 = 商品 + 运费 − 优惠，优惠由券面额与商品额封顶，不可能减穿）。
     * 需要「差额为负」的场景应先判方向再减，别让一个负金额在链路里漂流。
     */
    public Money minus(Money other) {
        requireSameCurrency(other);
        if (this.amount < other.amount) {
            throw new IllegalStateException("金额相减结果不能为负");
        }
        return new Money(this.amount - other.amount, this.currency);
    }

    private void requireSameCurrency(Money other) {
        if (other == null || !this.currency.equals(other.currency)) {
            throw new IllegalStateException("金额币种不一致，无法运算");
        }
    }
}
