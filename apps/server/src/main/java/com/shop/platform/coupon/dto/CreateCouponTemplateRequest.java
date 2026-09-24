package com.shop.platform.coupon.dto;

import com.shop.platform.common.Money;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/**
 * 新建券模板入参（卖家）。
 *
 * <p>金额是 Money（分 + 币种）而不是裸分：与出参 {@code CouponTemplateResponse} 同一口径，建券时定的币种
 * 就是券生效后的币种，服务端不再替卖家决定。平台一期只认定价币种（DB 侧 {@code CHECK (currency = 'CNY')}），
 * 越界币种在这里就 400。
 *
 * <p>一期只有「满 thresholdAmount 减 discountAmount」一种玩法。
 * 折扣券/运费券是二期，届时以判别列区分，不靠本入参的字段空缺来猜。
 */
public record CreateCouponTemplateRequest(
        @NotBlank @Size(max = CouponFieldRules.NAME_MAX, message = CouponFieldRules.NAME_MESSAGE) String name,
        /** 使用门槛，0 元 = 无门槛 */
        @NotNull Money thresholdAmount,
        /** 减免额（必须大于 0） */
        @NotNull Money discountAmount,
        /** 发放总量 */
        @NotNull @Min(1) @Max(CouponFieldRules.TOTAL_QUANTITY_MAX) Integer totalQuantity,
        @NotNull OffsetDateTime validFrom,
        @NotNull OffsetDateTime validTo) {

    public CreateCouponTemplateRequest {
        if (thresholdAmount != null) {
            thresholdAmount.requirePlatformCurrency();
        }
        if (discountAmount != null) {
            discountAmount.requirePlatformCurrency();
        }
    }
}
