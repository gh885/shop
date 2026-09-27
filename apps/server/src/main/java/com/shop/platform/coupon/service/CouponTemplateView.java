package com.shop.platform.coupon.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 券模板出参（卖家管理列表 / 建券与停券回执）。金额走 Money，状态出枚举 name()。 */
@Schema(name = "CouponTemplateResponse")
public record CouponTemplateView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        /** 使用门槛；0 表示无门槛 */
        @Schema(requiredMode = REQUIRED) Money threshold,
        /** 面额：DISCOUNT 型为 null（面值由折率与封顶表达） */
        @Schema(nullable = true) Money discount,
        /** 券型：FULL_REDUCTION 满减 / DISCOUNT 折扣（CPN-01） */
        @Schema(requiredMode = REQUIRED) String type,
        /** 折扣率（0.90 = 9 折）：仅 DISCOUNT 型非空 */
        @Schema(nullable = true) java.math.BigDecimal discountRate,
        /** 折扣封顶：仅 DISCOUNT 型非空（CPN-65） */
        @Schema(nullable = true) Money maxDiscount,
        /** 领取后 N 天有效：为 null 表示用户券沿用发放窗口（CPN-68） */
        @Schema(nullable = true) Integer validDays,
        @Schema(requiredMode = REQUIRED) OffsetDateTime validFrom,
        @Schema(requiredMode = REQUIRED) OffsetDateTime validTo,
        @Schema(requiredMode = REQUIRED) Integer totalQuantity,
        /** 已发放数：领出去多少张，卖家据此看还剩多少名额 */
        @Schema(requiredMode = REQUIRED) Integer issuedQuantity,
        /** 已核销数：真的被订单用掉多少张。与已发放数的差额 = 领了没用掉的那批（占用中的不算） */
        @Schema(requiredMode = REQUIRED) Long usedQuantity,
        @Schema(requiredMode = REQUIRED) String status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static CouponTemplateView from(ShopCoupon row) {
        return new CouponTemplateView(
                row.template().getId(),
                row.template().getName(),
                row.template().thresholdAsMoney(),
                row.template().discountAsMoney(),
                row.template().getType().name(),
                row.template().getDiscountRate(),
                row.template().maxDiscountAsMoney(),
                row.template().getValidDays(),
                row.template().getValidFrom(),
                row.template().getValidTo(),
                row.template().getTotalQuantity(),
                row.template().getIssuedQuantity(),
                row.usedQuantity(),
                row.template().getStatus().name(),
                row.template().getCreatedAt());
    }
}
