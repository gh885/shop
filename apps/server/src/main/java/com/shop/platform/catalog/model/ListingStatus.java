package com.shop.platform.catalog.model;

/**
 * Listing 的状态机。
 *
 * <p>状态只在 service 里通过 {@link Listing#transitionTo(ListingStatus)} 前进；mapper 只负责把状态落库。
 * 不认识的字符串一律拒绝——从数据库读到一个坏状态，比默默当成 draft 安全。
 */
public enum ListingStatus {
    DRAFT,
    PENDING,
    APPROVED,
    REJECTED,
    ONLINE,
    OFFLINE;

    public boolean canTransitionTo(ListingStatus target) {
        return switch (this) {
            case DRAFT -> target == PENDING;
            case PENDING -> target == APPROVED || target == REJECTED;
            case APPROVED -> target == ONLINE || target == OFFLINE;
            case REJECTED -> target == PENDING;
            case ONLINE -> target == OFFLINE;
            case OFFLINE -> target == PENDING;
        };
    }

    public static ListingStatus from(String value) {
        try {
            return valueOf(value.toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知的 listing 状态: " + value, e);
        }
    }
}
