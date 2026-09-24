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

    private CouponFieldRules() {}
}
