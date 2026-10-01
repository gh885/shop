package com.shop.platform.audit.api;

import com.shop.platform.common.Validate;
import java.util.Arrays;

/** 审计目标类型词表：被操作对象是哪一类。与 {@link AuditAction} 一起构成审计行的一格语义。 */
public enum AuditTargetType {
    /** 买家账号（account.users） */
    USER,
    /** 平台员工（account.staff） */
    STAFF,
    /** 用户券实例（coupon.user_coupons） */
    USER_COUPON,
    /** 店铺（shop.shops） */
    SHOP,
    /** 入驻审核记录（shop.shop_reviews） */
    SHOP_REVIEW,
    /** 物流异常单（logistics.shipment_issues） */
    SHIPMENT_ISSUE,
    /** 物流包裹（logistics.shipments） */
    SHIPMENT;

    /** wire 值 → 目标类型；未知值返回 null（调用方按非法筛选值处理） */
    public static AuditTargetType parseOrNull(String value) {
        if (value == null) {
            return null;
        }
        return Arrays.stream(values())
                .filter(type -> type.name().equals(value))
                .findFirst()
                .orElse(null);
    }

    /** 拒绝未知目标类型（400），不给「查不到就当没有」的静默放行 */
    public static AuditTargetType require(String value) {
        AuditTargetType type = parseOrNull(value);
        Validate.isTrue(type != null, "非法的审计目标类型筛选值");
        return type;
    }
}
