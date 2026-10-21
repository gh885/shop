package com.shop.platform.inventory.model;

import java.util.Locale;

/**
 * 预占的生命周期。
 *
 * <p>{@code released} 和 {@code expired} 分开记：一个是有人主动取消，一个是没人管它自己到期。
 * 查问题时这两个词差别很大，合并成一个就从"谁放掉了货"退化成"货没了"。
 */
public enum ReservationStatus {
    RESERVED,
    COMMITTED,
    CONSUMED,
    RELEASED,
    EXPIRED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static ReservationStatus from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }

    /** 还占着货的状态。释放和出库都只能从这个状态推进。 */
    public boolean holdsStock() {
        return this == RESERVED || this == COMMITTED;
    }
}
