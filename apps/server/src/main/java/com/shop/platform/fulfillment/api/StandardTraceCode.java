package com.shop.platform.fulfillment.api;

/**
 * 八个标准轨迹码。fulfillment 只认它们，承运商的上千种原始码由 logistics 翻译。
 *
 * <p>放在 api 包：它是 {@code recordTrace} 契约的一部分，logistics 是翻译方、
 * fulfillment 是消费方，两边必须引同一个定义。
 *
 * <p><b>{@code UNKNOWN} 必须存在。</b> 没有这一档，遇到码表查不到的码只有两个坏选择：
 * 猜一个，或者报错把整条轨迹丢掉。猜错会把"退签"当"签收"，直接触发结算——那是资损。
 * 认不出就记 unknown + 告警，等人补映射，状态不动。
 */
public enum StandardTraceCode {
    COLLECTED,
    IN_TRANSIT,
    OUT_FOR_DELIVERY,
    DELIVERED,
    REJECTED,
    RETURNED,
    /** 异常：只记录，不推进状态。 */
    EXCEPTION,
    /** 码表查不到：只记录，不推进状态。 */
    UNKNOWN;

    public String dbValue() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }

    public static StandardTraceCode from(String value) {
        return valueOf(value.toUpperCase(java.util.Locale.ROOT));
    }
}
