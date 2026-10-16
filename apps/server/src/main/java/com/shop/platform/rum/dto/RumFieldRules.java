package com.shop.platform.rum.dto;

/**
 * 遥测查询入参的数字词表：注解只引用这里的常量（GEN-61：数字字面量不许出现在注解里）。
 *
 * <p>这几个上限与 {@code rum.rum_events} 的列宽逐一同值——**它是查询侧，不是写入侧**：
 * 筛选值比列宽长一定匹配不到任何行，与其让调用方拿到一张空表去猜「是筛错了还是真没有」，
 * 不如在入口就按 400 拦下（{@code @Size} 挡长度，白名单挡内容，见 {@code RumQueryService}）。
 *
 * <p>与 {@link com.shop.platform.rum.RumVocabulary} 分开是刻意的：那边是**接收端**的词表，
 * 管「什么东西有资格进指标标签」、面向匿名的客户端；这边管「管理端能按什么筛」，两者只是恰好有
 * 几个同名的宽度。
 */
public final class RumFieldRules {

    /** 端筛选值上限：app 列宽 32 */
    public static final int APP_MAX = 32;

    /** 种类筛选值上限：kind 列宽 32 */
    public static final int KIND_MAX = 32;

    /** 路由筛选值上限：route 列宽 64（服务端已归一成模板，不会更长） */
    public static final int ROUTE_MAX = 64;

    /** 指纹筛选值上限：fingerprint 列宽 1000。**不能按 message 的 500 截**——截了就把一个
     *  合法的长指纹筛成另一个问题，症状是「点进去看到的是别人的堆栈」 */
    public static final int FINGERPRINT_MAX = 1000;

    private RumFieldRules() {}
}
