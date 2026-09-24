package com.shop.platform.shop.dto;

import com.shop.platform.common.Money;
import com.shop.platform.infra.region.RegionRegistry;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 运费模板保存入参（覆盖式：模板本体 + 规则 + 区域 + 不配送地区一次提交，整批重建）。
 *
 * <p>费用是 Money（分 + 币种）：与出参 {@code ShippingTemplateResponse} 同一口径，模板存了自己的币种，
 * 报价时不必再借订单的币种。平台一期只认定价币种（DB 侧 {@code CHECK (currency = 'CNY')}），越界即 400。
 *
 * <p>形状对齐淘宝运费模板，但只有一维（按件）：没有运送方式（快递/EMS/平邮各自定价）与按重量/体积，
 * 见 {@code V53} 的取舍说明。
 */
public record ShippingTemplateRequest(
        @NotNull Boolean freeShipping,
        @Min(1) Integer freeOverQuantity,
        /** 满额包邮门槛；null = 不设此条件 */
        Money freeOverAmount,
        @NotNull @Valid ShippingFeeTier defaultRule,
        @Size(max = 50) List<@Valid RegionalRule> regionRules,
        /**
         * 不配送地区前缀。这里的 {@code @Pattern} 只是形状门（省 2 / 市 4 / 区县 6），
         * 权威判定在 service 的 {@code validateRegions → RegionRegistry.requirePrefix}（还要落在真实区划码空间里），
         * 它同时覆盖 {@link RegionalRule#regionPrefixes} —— 那条字段没有形状门，因为它一路走的就是那道有名字的 400。
         */
        @Size(max = 100) List<@Pattern(regexp = RegionRegistry.PREFIX_PATTERN) String> excludedRegions) {

    public ShippingTemplateRequest {
        if (freeOverAmount != null) {
            freeOverAmount.requirePlatformCurrency();
        }
    }

    /** 整份模板的币种：各档费用已各自收口到平台币种，默认规则的首费即全模板的口径 */
    public String currency() {
        return defaultRule.firstFee().currency();
    }

    /** 一档按件运费：首件 firstQuantity 件收 firstFee，超出部分每满 addQuantity 件加 addFee */
    public record ShippingFeeTier(
            @NotNull @Min(1) Integer firstQuantity,
            @NotNull Money firstFee,
            @NotNull @Min(1) Integer addQuantity,
            @NotNull Money addFee) {

        public ShippingFeeTier {
            if (firstFee != null) {
                firstFee.requirePlatformCurrency();
            }
            if (addFee != null) {
                addFee.requirePlatformCurrency();
            }
        }
    }

    /**
     * 指定地区规则 = 一档运费 + 它覆盖的区域前缀（省 2 位 / 市 4 位 / 区县 6 位）。
     * 更长的前缀更具体，命中时优先于更短的（「广东省」与「深圳市」同时命中取深圳市）。
     */
    public record RegionalRule(
            @NotEmpty List<String> regionPrefixes,
            @NotNull @Min(1) Integer firstQuantity,
            @NotNull Money firstFee,
            @NotNull @Min(1) Integer addQuantity,
            @NotNull Money addFee) {

        public RegionalRule {
            if (firstFee != null) {
                firstFee.requirePlatformCurrency();
            }
            if (addFee != null) {
                addFee.requirePlatformCurrency();
            }
        }
    }
}
