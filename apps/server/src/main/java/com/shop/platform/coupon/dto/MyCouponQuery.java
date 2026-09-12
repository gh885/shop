package com.shop.platform.coupon.dto;

import jakarta.validation.constraints.Pattern;

/**
 * 我的券包筛选。status 对应券包页签（未使用 / 已使用 / 已过期），空 = 全部。
 *
 * <p>取值即 {@code UserCouponStatus} 的 name()——枚举自己就是合法值表，不另维护一份（与订单状态筛选取同法）。
 * 非法值被 @Pattern 拦成 400。
 */
public record MyCouponQuery(
        @Pattern(regexp = "UNUSED|LOCKED|USED|EXPIRED|VOID", message = "非法的券状态筛选值") String status) {}
