package com.shop.platform.coupon.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.mapper.CouponTemplate;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 券模板出参（卖家管理列表 / 建券回执）。金额走 Money，状态出枚举 name()。 */
public record CouponTemplateResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        /** 使用门槛；0 表示无门槛 */
        @Schema(requiredMode = REQUIRED) Money threshold,
        @Schema(requiredMode = REQUIRED) Money discount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime validFrom,
        @Schema(requiredMode = REQUIRED) OffsetDateTime validTo,
        @Schema(requiredMode = REQUIRED) Integer totalQuantity,
        /** 已发放数：卖家据此看还剩多少名额 */
        @Schema(requiredMode = REQUIRED) Integer issuedQuantity,
        @Schema(requiredMode = REQUIRED) String status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static CouponTemplateResponse from(CouponTemplate t) {
        return new CouponTemplateResponse(
                t.getId(),
                t.getName(),
                t.thresholdAsMoney(),
                t.discountAsMoney(),
                t.getValidFrom(),
                t.getValidTo(),
                t.getTotalQuantity(),
                t.getIssuedQuantity(),
                t.getStatus().name(),
                t.getCreatedAt());
    }
}
