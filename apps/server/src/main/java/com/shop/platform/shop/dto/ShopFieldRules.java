package com.shop.platform.shop.dto;

/**
 * 店铺侧入参的字段规则：开店、入驻审核、商家地址、运费模板四个入口共用一份，不各抄一遍。
 *
 * <p>注解元素值必须是编译期常量表达式，所以这里是常量而不是校验器，执行仍由 Bean Validation 完成。
 * 值一个都没改：这些数字经 springdoc 导出进 {@code openapi/api-docs.json}，动数字属于接口变更
 * （要跑 {@code pnpm gen:sdk}，{@code ApiDocsContractTest} 会先红），本类只做「同一数字的定义处收一」。
 * Java 常量 ↔ 已发布契约 ↔ 迁移列宽是否还相等，由 {@code FieldRuleVocabularyTest} 逐条核对（不连库、不起 Spring）。
 */
public final class ShopFieldRules {

    /** 店铺名上限（字）：与 {@code shop.shops.name VARCHAR(50)} 同值；卖家端镜像 {@code apps/seller/src/shop/constants.ts} */
    public static final int NAME_MAX = 50;

    /** 店铺 logo 的对象存储 key 上限：{@code shop.shops.logo_key VARCHAR(255)}（存 key 不存完整 URL，见 V39） */
    public static final int LOGO_KEY_MAX = 255;

    /**
     * 入驻审核备注上限（字）：落点是 {@code shop.shop_reviews.reason VARCHAR(255)}。
     *
     * <p><b>它与 {@code NoteFieldRules.FREE_TEXT_MAX}（200）是同一个概念、两档列宽</b>：「一段人写的说明」在
     * 七个入口都是 200，唯独审核这一格建表时给了 255。这里刻意不引用 200——入站上限必须不越过列宽，
     * 但把入站收到 200 会让审核备注无声缩水 55 字（现网已有的长备注不会被允许改写），而放宽列宽属于库变更。
     * 两档并存的这笔账记在 {@code docs/business-rules/crosscut.md}，等值关系由门禁核对。
     */
    public static final int REVIEW_REASON_MAX = 255;

    /** 面单寄件公司名上限（字）：{@code shop.addresses.company_name VARCHAR(60)}，与券名同数不同概念 */
    public static final int COMPANY_NAME_MAX = 60;

    /**
     * 邮政编码位数：同一个 6 此前在这一个组件上各写两遍——{@code @Size(max = 6)} 与
     * {@code @Pattern(regexp = "^\\d{6}$")}。改了正则忘改长度，就是「输入框能敲 7 位、提交必 400」的成因。
     * 现在形状由这个数拼出来，两格由构造保证同源。
     */
    public static final int POSTAL_CODE_DIGITS = 6;

    /**
     * 邮编形状（恰好 {@value #POSTAL_CODE_DIGITS} 位数字）：与 {@code RegionRegistry.CODE_PATTERN} 逐字符相同，
     * 但它是另一个概念——邮编不参与区划存在性判定，所以刻意不引用同一个常量（见
     * {@code MerchantAddressRequest.postalCode} 上的说明）。
     */
    public static final String POSTAL_CODE_PATTERN = "^\\d{" + POSTAL_CODE_DIGITS + "}$";

    /** 一张运费模板最多挂几条地区规则：再多就不是「指定地区」而是逐区县铺表，模板本身已不可读 */
    public static final int REGION_RULES_MAX = 50;

    /** 不配送地区最多几个前缀：与 {@link #REGION_RULES_MAX} 同一类闸门（防刷提交），只是落在另一列 */
    public static final int EXCLUDED_REGIONS_MAX = 100;

    private ShopFieldRules() {}
}
