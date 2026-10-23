package com.shop.platform.infra.security;

/**
 * 全局权限点。清单驱动——这份枚举和 {@code common.permission} 表在启动时做双向比对，
 * 少一个多一个应用都起不来。
 *
 * <p>为什么不用字符串常量散落在各处：拼错一个字母不会报错，只会让那项权限永远为假，
 * 或者永远为真。这类 bug 只有在出事时才会被发现。
 */
public enum Permission {
    // —— 卖家域 ——
    ORDER_READ("order:read"),
    ORDER_REFUND("order:refund"),
    PRODUCT_READ("product:read"),
    PRODUCT_WRITE("product:write"),
    SHOP_READ("shop:read"),
    STAFF_MANAGE("staff:manage"),
    FINANCE_READ("finance:read"),
    SETTLEMENT_APPROVE("settlement:approve"),

    // —— 平台域 ——
    // 这 8 个由 staff 身份持有，与卖家的 8 个互不重叠：一个平台运营不该有"编辑某个商家的商品"的权限，
    // 一个卖家也不该有"审核入驻"的权限。共用同一张 common.permission 表，是因为它是权限点的总清单，
    // 不是"卖家权限表"——Authorizer 启动时拿整张表和本枚举双向比对。
    SHOP_REVIEW("SHOP_REVIEW"),
    SHOP_GOVERNANCE("SHOP_GOVERNANCE"),
    CATEGORY_MANAGE("CATEGORY_MANAGE"),
    PRODUCT_REVIEW("PRODUCT_REVIEW"),
    CMS_MANAGE("CMS_MANAGE"),
    LOGISTICS_MANAGE("LOGISTICS_MANAGE"),
    COUPON_OPS("COUPON_OPS"),
    AUDIT_VIEW("AUDIT_VIEW"),
    RUM_VIEW("RUM_VIEW");

    private final String code;

    Permission(String code) {
        this.code = code;
    }

    public String code() {
        return code;
    }
}
