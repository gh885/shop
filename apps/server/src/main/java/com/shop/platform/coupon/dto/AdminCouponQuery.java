package com.shop.platform.coupon.dto;

import com.shop.platform.coupon.model.UserCouponStatus;
import jakarta.validation.constraints.Pattern;
import java.util.UUID;

/** 平台用户券运营列表筛选：用户、店铺、状态均可选，组合条件按 AND 收窄。 */
public record AdminCouponQuery(
        UUID userId, UUID shopId, @Pattern(regexp = UserCouponStatus.PATTERN, message = "非法的券状态筛选值") String status) {}
