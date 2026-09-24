package com.shop.platform.common;

/**
 * 运单字段的长度规则：卖家发货与买家回寄两个入口共用一份，每个值都等于库上的列宽。
 *
 * <p>三个数不是「随手取的整数」，各自的权威出处：
 * <ul>
 *   <li>{@link #CARRIER_CODE_MAX} ＝ {@code logistics.carriers.code VARCHAR(32) UNIQUE}。入参只是拿它去查字典，
 *       长度门取列宽本身，不会因为「反正查不到」而放宽；
 *   <li>{@link #CARRIER_NAME_MAX} ＝ {@code logistics.shipments.carrier_name VARCHAR(50)}。买家的快递公司是手输
 *       而非字典下拉（{@code CarrierResolver}：对不上字典就原样记），所以这一格真能装进 50 字；
 *   <li>{@link #TRACKING_NO_MAX} ＝ 面单号上限，库上三处同为 {@code VARCHAR(64)}：
 *       {@code logistics.shipments.tracking_no}、{@code orders.orders.tracking_no}、
 *       {@code aftersale.tickets.return_tracking_no}。
 * </ul>
 *
 * <p><b>为什么收在 common</b>：logistics 与 aftersale 两个模块都在校验同一组字段，而模块间不许 import 对方的
 * dto/service（只开 api / events 通道）。common 是 {@code @Modulithic(sharedModules)} 里的纯常量包，
 * 放这里不算开新依赖；放任一方都会被另一方反向依赖。
 *
 * <p>本类只做「同一数字的定义处收一」，三个值与原先写在各 DTO 里的字面量逐字节相同，契约那一格没动。
 * Java 常量 ↔ 已发布 OpenAPI ↔ 迁移列宽是否还相等，由 {@code FieldRuleVocabularyTest} 逐条核对
 * （不连库、不起 Spring 上下文）。用户能手打的那两格（展示名、运单号）另有前端镜像 {@code packages/common/src/tracking.ts}，
 * 同一门禁核对；{@link #CARRIER_CODE_MAX} 不镜像——它只能从字典里选，前端没有那一格输入框。
 */
public final class TrackingFieldRules {

    /** 承运商字典 code 上限 */
    public static final int CARRIER_CODE_MAX = 32;

    /** 承运商展示名上限：买家回寄时是手输原文 */
    public static final int CARRIER_NAME_MAX = 50;

    /** 运单号上限 */
    public static final int TRACKING_NO_MAX = 64;

    private TrackingFieldRules() {}
}
