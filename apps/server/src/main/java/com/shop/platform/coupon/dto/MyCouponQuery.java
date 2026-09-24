package com.shop.platform.coupon.dto;

import com.shop.platform.coupon.model.UserCouponStatus;
import jakarta.validation.constraints.Pattern;

/**
 * 我的券包筛选。status 对应券包页签（未使用 / 已使用 / 已过期），空 = 全部。
 *
 * <p>取值即 {@link UserCouponStatus} 的 name()——合法值表只有枚举那一处，本文件引用
 * {@link UserCouponStatus#PATTERN}（与订单/售后/店铺审核状态筛选同法：那三处不带形状门，
 * 到 service 的 {@code Validate.enumFilter} 才判，所以不需要第二份词表）。
 */
public record MyCouponQuery(@Pattern(regexp = UserCouponStatus.PATTERN, message = "非法的券状态筛选值") String status) {}
