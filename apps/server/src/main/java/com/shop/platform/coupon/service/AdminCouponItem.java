package com.shop.platform.coupon.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.UserCouponStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 平台用户券运营行：只出治理与展示所需字段，用户/店铺信息由各模块 api 拼装。 */
public record AdminCouponItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID userId,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED, nullable = true) String shopName,
        @Schema(requiredMode = REQUIRED) UUID templateId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) Money threshold,
        @Schema(requiredMode = REQUIRED) Money discount,
        @Schema(requiredMode = REQUIRED) CouponBearer bearer,
        @Schema(requiredMode = REQUIRED) OffsetDateTime effectiveAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime expireAt,
        @Schema(requiredMode = REQUIRED) UserCouponStatus status,
        @Schema(requiredMode = REQUIRED) CouponSource source,
        @Schema(requiredMode = REQUIRED, nullable = true) UUID orderId,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
