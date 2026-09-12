package com.shop.platform.coupon.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/**
 * 新建券模板入参（卖家）。
 *
 * <p>金额单位一律<b>分</b>，不带币种——币种由平台的定价币种决定（与运费模板入参同口径）。
 *
 * <p>一期只有「满 thresholdAmount 减 discountAmount」一种玩法，thresholdAmount = 0 即无门槛。
 * 折扣券/运费券是二期，届时以判别列区分，不靠本入参的字段空缺来猜。
 */
public record CreateCouponTemplateRequest(
        @NotBlank @Size(max = 60, message = "券名最多 60 字") String name,
        /** 使用门槛（分），0 = 无门槛 */
        @NotNull @Min(0) Long thresholdAmount,
        /** 减免额（分） */
        @NotNull @Min(1) Long discountAmount,
        /** 发放总量 */
        @NotNull @Min(1) @Max(1_000_000) Integer totalQuantity,
        @NotNull OffsetDateTime validFrom,
        @NotNull OffsetDateTime validTo) {}
