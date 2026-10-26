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

    /**
     * 落库值。
     *
     * <p><b>这个方法之前不存在，于是 {@code ListingMapper.find} 根本跑不起来。</b>
     * {@code DbEnumTypeHandler} 在构造时要求每个模型枚举同时有 {@code dbValue()} 和
     * {@code from(String)}，少一个就抛 {@code IllegalStateException}。而 {@code find}
     * 在整个重写版里没有任何调用者（{@code approveOffer} / {@code rejectListing} /
     * {@code offlineOffer} 都会先走它），所以从改名到现在的**平台审核通过 / 驳回 / 下架
     * 三条链路一直是 500**，只是没人跑过。
     *
     * <p>这条与 {@code audit.audit_action} 里 {@code catalog.offer.*} 那个漏洞同根：
     * 都是「代码写了、没被调用、所以没报错」。补测试才把它们拓出来。
     */
    public String dbValue() {
        return name().toLowerCase(java.util.Locale.ROOT);
    }
}
