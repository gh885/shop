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

    private AddressFieldRules() {}
}
