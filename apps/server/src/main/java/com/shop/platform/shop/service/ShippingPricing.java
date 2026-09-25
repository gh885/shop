package com.shop.platform.shop.service;

import com.shop.platform.shop.mapper.ShippingRule;
import com.shop.platform.shop.mapper.ShippingTemplate;
import java.util.List;

/**
 * 运费模板的计费口径 —— 模板 + 它的全部规则与区域，装配好的只读形状。
 *
 * <p>把「散在四张表里的模板」聚成一个整体交给 {@link ShippingFeeCalculator}：计费器是纯函数
 * （只吃这个形状 + 收货区码 + 订单件数/金额），可以脱离数据库单测——运费算错的代价比多一个 record 大得多。
 *
 * <p>装的是 mapper 实体，故不得越过 HTTP 边界，
 * controller 出参一律经 {@code ShippingTemplateView} 转换。
 */
public record ShippingPricing(
        ShippingTemplate template,
        ShippingRule defaultRule,
        List<RegionRule> regionRules,
        List<String> excludedRegions) {

    /** 一条指定地区规则 + 它覆盖的区域前缀 */
    public record RegionRule(ShippingRule rule, List<String> regionPrefixes) {}
}
