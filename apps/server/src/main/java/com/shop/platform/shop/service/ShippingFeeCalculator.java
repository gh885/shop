package com.shop.platform.shop.service;

import com.shop.platform.common.Money;
import com.shop.platform.shop.api.ShippingQuote;
import com.shop.platform.shop.mapper.ShippingRule;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 运费计费器 —— 纯函数，不碰数据库（模板装配见 {@link ShippingPricing} 与 {@link ShippingTemplateService}）。
 *
 * <p>判定次序是有讲究的，不是随手排的：
 * <ol>
 *   <li><b>不配送优先于一切</b>：送不到就不该走到定价，连包邮条件也不该救它（淘宝的「不配送地区」是硬拦截）。
 *   <li><b>模板级包邮优先于逐地区定价</b>：整店包邮/满件/满额是对全店的承诺，不该因为某地区配了运费规则而失效；
 *       想在包邮之外单独收某个地区的运费，正确做法是别开这个包邮条件。
 *   <li><b>指定地区优先于默认</b>，同时候选里<b>最长前缀胜</b>：{@code 44}（广东）与 {@code 4403}（深圳）
 *       同时命中深圳的收货地址时取后者——「更具体」由编码长度天然表达，不需要优先级列。
 *   <li>都不命中回落<b>默认规则</b>（模板必须配，故兜底永远存在）。
 * </ol>
 */
@Component
public class ShippingFeeCalculator {

    /** 按件计费报价：收货区码 + 同店合计件数/商品额 → 运费 */
    public ShippingQuote quote(ShippingPricing pricing, String regionCode, int totalQuantity, Money itemAmount) {
        // 1. 不配送：命中即送不到，运费无意义（给 0 而不是给个哨兵金额，order 看 deliverable 决定拒绝下单）
        if (excluded(pricing.excludedRegions(), regionCode)) {
            return new ShippingQuote(pricing.template().getId(), false, zero(itemAmount));
        }
        // 2. 模板级包邮：整店包邮或满件/满额（判定基数是同店商品总额，运费是待求的结果，不能拿它判条件）
        if (pricing.template().freeAt(totalQuantity, itemAmount.amount())) {
            return new ShippingQuote(pricing.template().getId(), true, zero(itemAmount));
        }
        // 3. 选规则：最长前缀胜；无任何指定地区命中则回落默认规则
        ShippingRule rule = longestMatch(pricing.regionRules(), regionCode).orElse(pricing.defaultRule());
        return new ShippingQuote(
                pricing.template().getId(), true, Money.ofFen(rule.feeOf(totalQuantity), itemAmount.currency()));
    }

    /** 收货区码是否落在不配送前缀下（前缀命中，粒度不看长短：排除一个省与排除一个区县同样直接） */
    private static boolean excluded(List<String> excludedRegions, String regionCode) {
        return excludedRegions.stream().anyMatch(regionCode::startsWith);
    }

    /** 指定地区规则里前缀最长的那条（前缀长度即粒度：6 位区县 > 4 位市 > 2 位省） */
    private static Optional<ShippingRule> longestMatch(List<ShippingPricing.RegionRule> rules, String regionCode) {
        ShippingRule best = null;
        int bestLength = -1;
        for (ShippingPricing.RegionRule regionRule : rules) {
            for (String prefix : regionRule.regionPrefixes()) {
                if (regionCode.startsWith(prefix) && prefix.length() > bestLength) {
                    best = regionRule.rule();
                    bestLength = prefix.length();
                }
            }
        }
        return Optional.ofNullable(best);
    }

    /** 零运费：币种跟订单走，不能凭空造一个 CNY（模板本身不存币种） */
    private static Money zero(Money itemAmount) {
        return Money.ofFen(0, itemAmount.currency());
    }
}
