package com.shop.platform.coupon.dto;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.model.CouponType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * 新建券模板入参（卖家）。
 *
 * <p>金额是 Money（分 + 币种）而不是裸分：与出参 {@code CouponTemplateView} 同一口径，建券时定的币种
 * 就是券生效后的币种，服务端不再替卖家决定。平台一期只认定价币种（DB 侧 {@code CHECK (currency = 'CNY')}），
 * 越界币种在这里就 400。
 *
 * <p>两型券的字段互斥（CPN-01/65）：DISCOUNT 给 {@code discountRate} + {@code maxDiscountAmount}、
 * {@code discountAmount} 留 null；FULL_REDUCTION 反之。互斥的语义校验在 service（这里只挡形状），
 * 库上还有 CHECK 兜底。
 */
@Schema(description = "新建券模板")
public record CreateCouponTemplateRequest(
        @NotBlank @Size(max = CouponFieldRules.NAME_MAX, message = CouponFieldRules.NAME_MESSAGE) String name,
        @NotNull @Schema(description = "券型：FULL_REDUCTION 满减 / DISCOUNT 折扣") CouponType type,
        /** 使用门槛，0 元 = 无门槛（两型共用） */
        @NotNull Money thresholdAmount,
        /** 减免额（必须大于 0）；DISCOUNT 型留 null */
        Money discountAmount,
        /** 折扣率（0.01~0.99，0.90 即 9 折）；DISCOUNT 型必填 */
        BigDecimal discountRate,
        /** 折扣封顶（必须大于 0）；DISCOUNT 型必填（CPN-65） */
        Money maxDiscountAmount,
        /** 发放总量 */
        @NotNull @Min(1) @Max(CouponFieldRules.TOTAL_QUANTITY_MAX) Integer totalQuantity,
        /** 发放窗口起点（什么时候能领） */
        @NotNull OffsetDateTime validFrom,
        /** 发放窗口终点 */
        @NotNull OffsetDateTime validTo,
        /** 领取后 N 天有效（CPN-68）；留空 = 用户券沿用 [validFrom, validTo) 绝对窗口 */
        @Min(CouponFieldRules.VALID_DAYS_MIN) @Max(CouponFieldRules.VALID_DAYS_MAX) Integer validDays) {

    public CreateCouponTemplateRequest {
        if (thresholdAmount != null) {
            thresholdAmount.requirePlatformCurrency();
        }
        if (discountAmount != null) {
            discountAmount.requirePlatformCurrency();
        }
        if (maxDiscountAmount != null) {
            maxDiscountAmount.requirePlatformCurrency();
        }
    }
}
