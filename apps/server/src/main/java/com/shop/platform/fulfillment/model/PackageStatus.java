package com.shop.platform.fulfillment.model;

import java.util.Locale;

/**
 * 包裹状态。
 *
 * <p><b>单调，只升不降。</b> {@code delivered} 之后收到的任何轨迹都不改状态，只记录——
 * 否则一条延迟到达的"运输中"会把已签收的包裹改回去，然后买家页从"已签收"跳回"运输中"。
 *
 * <p>{@code unknown} 不在这里：那是轨迹标准码的取值，不是包裹状态。认不出的轨迹不推进状态。
 */
public enum PackageStatus {
    CREATED,
    SHIPPED,
    IN_TRANSIT,
    DELIVERED,
    RETURNED,
    CANCELLED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static PackageStatus from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }

    /** 终态：不能再被任何轨迹推进。 */
    public boolean isFinal() {
        return this == DELIVERED || this == RETURNED || this == CANCELLED;
    }
}
