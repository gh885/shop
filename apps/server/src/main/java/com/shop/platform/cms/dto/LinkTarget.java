package com.shop.platform.cms.dto;

/**
 * 首页内容（banner / 导航 / 推荐位）点击后的跳转目标类型。
 *
 * <p>这里放的是<b>词表本身</b>，不是字段类型：三个请求 DTO 的 {@code targetType} 仍是 String，
 * 引用 {@link #PATTERN} 那一格。换成枚举类型会改 OpenAPI 里那一格的形状，SDK 得整个重新生成；
 * 而词表漂移是真实风险——同一条 alternation 曾在三个 DTO 上各抄一遍、又在三个实体注释里各抄一遍。
 * 加一种目标：改这里的枚举常量 + {@link #PATTERN}，前端选项表跟着加一项。
 */
public enum LinkTarget {
    /** 商品详情页 */
    PRODUCT,
    /** 类目页 */
    CATEGORY,
    /** 活动页 */
    CAMPAIGN,
    /** 搜索结果页 */
    SEARCH,
    /** 任意 URL */
    URL;

    /**
     * 给 {@code @Pattern} 用的 alternation。
     *
     * <p>它写成字面量而不是 {@code String.join("|", names())}，是语言逼的：注解元素值必须是编译期常量表达式，
     * 方法调用不行。于是「枚举是唯一的词表」这条只能由测试钉住——
     * {@code ValidationVocabularyTest} 断言本常量逐字节等于枚举名按声明序拼出的 alternation，
     * 加了枚举值忘了改这里就红。
     */
    public static final String PATTERN = "PRODUCT|CATEGORY|CAMPAIGN|SEARCH|URL";
}
