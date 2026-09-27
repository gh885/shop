package com.shop.platform.coupon.dto;

/**
 * 券模板的字段口径：券名一处定义，入参注解与它的报错文案都从这里取。
 *
 * <p>写这一份的理由不是「60 出现了好几次」——目前只有这一个注解用它——而是
 * {@code @Size(max = 60, message = "券名最多 60 字")} 把同一个数<b>在同一个注解里写了两遍</b>：
 * 上限改了、提示没改，卖家界面就写着「最多 60 字」而实际放行 100 字（或反过来挡掉合法名字）。
 * 文案由常量拼出之后，这类不一致在源码里就不存在了，而不需要谁去记得改第二处。
 *
 * <p>注解元素值必须是编译期常量表达式，所以这里是常量；值与落点 {@code coupon.coupon_templates.name}
 * 的 {@code VARCHAR(60)} 同值，等式由 {@code FieldRuleVocabularyTest} 核对。卖家端表单的
 * {@code maxLength} 是第三份，同样由它核对。
 */
public final class CouponFieldRules {

    /** 券名上限（字）：券卡片上「满 X 减 Y」那一行旁边就只有这么宽的位置 */
    public static final int NAME_MAX = 60;

    /** 券名超限提示：数字从 {@link #NAME_MAX} 来，不另抄一遍 */
    public static final String NAME_MESSAGE = "券名最多 " + NAME_MAX + " 字";

    /**
     * 一张券模板最多发多少张：入口侧的防误填闸门（本想填 1 万、多敲三个 0）。
     *
     * <p>{@code coupon.coupon_templates.total_quantity} 是 INT，库上那道 CHECK 只管 {@code > 0}
     * （防超发靠领券时的条件更新 {@code issued < total}，见 V56），所以上界只存在于入口这一侧。
     * 它与 {@code Quantities} 那几条不是一回事：那几条量的是「一笔交易塞得下几行」，这一条量的是发行总量。
     */
    public static final int TOTAL_QUANTITY_MAX = 1_000_000;

    /**
     * 相对有效期（领取后 N 天）的下界：1 天起（0 天 = 领到即失效，那不如不发）。
     * 与迁移里 {@code ck_coupon_templates_valid_days} 的 CHECK 同值。
     */
    public static final int VALID_DAYS_MIN = 1;

    /** 相对有效期的上界：一年。超过它多半是卖家填错了单位（想填 3650 天），入口这一侧挡住 */
    public static final int VALID_DAYS_MAX = 365;

    /** 折扣率上界（不含 1.00）：1.00 不构成折扣 */
    public static final String DISCOUNT_RATE_MAX_MESSAGE = "折扣率需在 0.01~0.99 之间（0.90 即 9 折）";

    private CouponFieldRules() {}
}
