package com.shop.platform.shop.dto;

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
 * <p>费用单位一律<b>分</b>（与订单金额列同口径），币种由平台的定价币种决定，故入参不带币种。
 * 形状对齐淘宝运费模板，但只有一维（按件）：没有运送方式（快递/EMS/平邮各自定价）与按重量/体积，
 * 见 {@code V53} 的取舍说明。
 */
public record ShippingTemplateRequest(
        @NotNull Boolean freeShipping,
        @Min(1) Integer freeOverQuantity,
        @Min(0) Long freeOverAmount,
        @NotNull @Valid ShippingFeeTier defaultRule,
        @Size(max = 50) List<@Valid RegionalRule> regionRules,
        @Size(max = 100) List<@Pattern(regexp = "\\d{2}|\\d{4}|\\d{6}") String> excludedRegions) {

    /** 一档按件运费：首件 firstQuantity 件收 firstFee 分，超出部分每满 addQuantity 件加 addFee 分 */
    public record ShippingFeeTier(
            @NotNull @Min(1) Integer firstQuantity,
            @NotNull @Min(0) Long firstFee,
            @NotNull @Min(1) Integer addQuantity,
            @NotNull @Min(0) Long addFee) {}

    /**
     * 指定地区规则 = 一档运费 + 它覆盖的区域前缀（省 2 位 / 市 4 位 / 区县 6 位）。
     * 更长的前缀更具体，命中时优先于更短的（「广东省」与「深圳市」同时命中取深圳市）。
     */
    public record RegionalRule(
            @NotEmpty List<String> regionPrefixes,
            @NotNull @Min(1) Integer firstQuantity,
            @NotNull @Min(0) Long firstFee,
            @NotNull @Min(1) Integer addQuantity,
            @NotNull @Min(0) Long addFee) {}
}
