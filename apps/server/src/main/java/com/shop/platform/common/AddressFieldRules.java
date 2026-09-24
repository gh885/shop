package com.shop.platform.common;

/**
 * 地址字段的长度口径：买家收货地址与商家寄退地址共用一份，不各抄一遍。
 *
 * <p>两侧此前各写各的：{@code AddressRequest}（account）与 {@code MerchantAddressRequest}（shop）都把
 * 「人名/地名 30 字、详址 120 字」抄在注解里，今天逐字节相同。相同正是可以放心收成一份的理由——
 * 这类复制上的漂移是无声的：改了买家那侧、商家表单还按老上限放行，超出的部分在 DB 那格被截或被拒，
 * 取决于列宽而不是任何一条规则。
 *
 * <p><b>还有第三侧</b>：{@code packages/common/src/address.ts} 里前端表单按同样的数字做提交前校验，
 * 此前只在注释里用散文指一下后端（「人名/地名 @Size(max=30)」）。散文不会报错，所以那两个数现在由
 * {@code FieldRuleVocabularyTest} 逐字节核对 Java 与 TS 两份常量。要改上限，三处一起改，测试会提醒漏了谁。
 *
 * <p>注解元素值必须是编译期常量表达式，所以这里是常量而不是校验器；执行仍由 Bean Validation 完成。
 */
public final class AddressFieldRules {

    /** 人名与地名的上限（字）：收货人 / 联系人 / 省 / 市 / 区同一档——展示位就那么宽 */
    public static final int NAME_MAX = 30;

    /** 详细地址上限（字）：不含省市区（占位文案就写着「不需要重复输入省/市/区」） */
    public static final int DETAIL_MAX = 120;

    /**
     * 智能粘贴那一框的上限（字）：整段文本（姓名+电话+省市区+详址）一次贴进来，比任何单字段都宽。
     *
     * <p>它不落库（解析完即弃），所以没有列宽可对齐——但卖家端/买家端那个 textarea 的 {@code maxLength}
     * 抄的是同一个数，两处不一致时表现为「粘得进去、提交必 400」，由 {@code FieldRuleVocabularyTest} 核对。
     */
    public static final int PARSE_TEXT_MAX = 500;

    /**
     * 地址标签上限（字）：内置枚举码（HOME/WORK/…）或用户自填的短文案，落点 {@code account.addresses.label}。
     *
     * <p>它与 {@link #NAME_MAX} 都是「短文本」但不同档：一个是给地址起的别名（卡片上单行显示），
     * 一个是收货人姓名。合并成一个常量，日后放宽姓名就会连带放宽标签那一格。
     */
    public static final int LABEL_MAX = 20;

    private AddressFieldRules() {}
}
