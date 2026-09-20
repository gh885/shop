package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.shop.mapper.ShippingRule;
import com.shop.platform.shop.service.ShippingPricing;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 运费模板出参，镜像 service 形状 ShippingPricing（内嵌 mapper 实体不得越过 HTTP 边界，故这里逐层转换）。
 *
 * <p>费用以 Money 出参：模板与规则各自存了币种，派生方法在原行上配齐（报价合同上的钱是什么币种，读出来就是什么币种）。
 *
 * <p><b>子 record 的 {@code @Schema(name)} 不是装饰</b>：springdoc 默认用嵌套类简单名当 schema 名，
 * 而本模块的入参 {@code ShippingTemplateRequest.RegionalRule} 与这里的同名 record <b>字段不同</b>
 * （请求是平铺的一档运费，响应是「规则 + 区域」），不显式区分就会让两个不同形状抢同一个 schema 名，
 * 生成出来的 SDK 会拿请求形状去校验响应 —— 契约在编译期看着对，运行期校验必炸
 * （同 cart 的 {@code CartProductInfo} 写法）。
 */
public record ShippingTemplateResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) boolean freeShipping,
        @Schema(requiredMode = REQUIRED, nullable = true) Integer freeOverQuantity,
        @Schema(requiredMode = REQUIRED, nullable = true) Money freeOverAmount,
        @Schema(requiredMode = REQUIRED) FeeTier defaultRule,
        @Schema(requiredMode = REQUIRED) List<RegionalRule> regionRules,
        @Schema(requiredMode = REQUIRED) List<String> excludedRegions) {

    public static ShippingTemplateResponse from(ShippingPricing pricing) {
        return new ShippingTemplateResponse(
                pricing.template().getId(),
                pricing.template().getShopId(),
                Boolean.TRUE.equals(pricing.template().getFreeShipping()),
                pricing.template().getFreeOverQuantity(),
                pricing.template().freeOverAmountAsMoney(),
                FeeTier.from(pricing.defaultRule()),
                pricing.regionRules().stream()
                        .map(rule -> new RegionalRule(FeeTier.from(rule.rule()), rule.regionPrefixes()))
                        .toList(),
                pricing.excludedRegions());
    }

    /** 一档按件运费：首件价 + 续件价（带库内规则 ID，供卖家侧对应回显） */
    @Schema(name = "ShippingTemplateFeeTier", description = "一档按件运费：首件价 + 续件价")
    public record FeeTier(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) Integer firstQuantity,
            @Schema(requiredMode = REQUIRED) Money firstFee,
            @Schema(requiredMode = REQUIRED) Integer addQuantity,
            @Schema(requiredMode = REQUIRED) Money addFee) {

        static FeeTier from(ShippingRule rule) {
            return new FeeTier(
                    rule.getId(),
                    rule.getFirstQuantity(),
                    rule.firstFeeAsMoney(),
                    rule.getAddQuantity(),
                    rule.addFeeAsMoney());
        }
    }

    /** 指定地区规则 = 一档运费 + 它覆盖的区域前缀（省 2 位 / 市 4 位 / 区县 6 位） */
    @Schema(name = "ShippingTemplateRegionRule", description = "指定地区规则：一档运费 + 覆盖的区域前缀")
    public record RegionalRule(
            @Schema(requiredMode = REQUIRED) FeeTier rule,
            @Schema(requiredMode = REQUIRED) List<String> regionPrefixes) {}
}
