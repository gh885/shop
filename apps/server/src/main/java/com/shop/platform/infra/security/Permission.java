package com.shop.platform.infra.security;

/**
 * 全局权限点。清单驱动——这份枚举和 {@code common.permission} 表在启动时做双向比对，
 * 少一个多一个应用都起不来。
 *
 * <p>为什么不用字符串常量散落在各处：拼错一个字母不会报错，只会让那项权限永远为假，
 * 或者永远为真。这类 bug 只有在出事时才会被发现。
 */
public enum Permission {
    ORDER_READ("order:read"),
    ORDER_REFUND("order:refund"),
    PRODUCT_READ("product:read"),
    PRODUCT_WRITE("product:write"),
    SHOP_READ("shop:read"),
    STAFF_MANAGE("staff:manage"),
    FINANCE_READ("finance:read"),
    SETTLEMENT_APPROVE("settlement:approve");

    private final String code;

    Permission(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}
