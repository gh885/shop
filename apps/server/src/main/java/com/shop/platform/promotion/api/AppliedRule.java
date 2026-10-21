package com.shop.platform.promotion.api;

import java.util.UUID;

/**
 * 一条已展开的生效规则：算价层只认这个形状，不碰 promotion 的表。
 *
 * <p>{@code scope} 是三档作用范围，不能合并成"订单级"：跨店满减和店铺满减是两种不同的分摊范围，
 * 合成一个分支就会让分摊算法开始长 if。
 *
 * @param baseMode 计费基数取原价还是前序优惠后的余额。满减通常看原价，券通常看余额——这是配置，不是代码分支
 * @param mutexGroup 互斥组；同组只取门槛通过且优先级数值最小的第一条
 */
public record AppliedRule(
        UUID ruleId,
        String ruleVersion,
        String type,
        Scope scope,
        Bearer bearer,
        Long threshold,
        Integer rateBp,
        Long fixedAmount,
        BaseMode baseMode,
        String mutexGroup,
        int priority) {

    /** 作用范围三档，与 {@code price_quote_rule.scope} 的库约束一一对应。 */
    public enum Scope {
        LINE,
        SELLER_ORDER,
        ORDER_GROUP
    }

    /** 谁掏这笔钱。结算是按商家算的，"减了多少"不够，还得知道"谁出"。 */
    public enum Bearer {
        PLATFORM,
        MERCHANT
    }

    public enum BaseMode {
        /** 看原价（满减通常这样）。 */
        ORIGINAL,
        /** 看前序优惠之后的余额（券通常这样）。 */
        AFTER_PREVIOUS
    }

    public AppliedRule {
        if (scope == null || bearer == null || baseMode == null) {
            throw new IllegalArgumentException("规则的 scope / bearer / baseMode 都不能为空");
        }
        if (rateBp == null && fixedAmount == null) {
            throw new IllegalArgumentException("规则必须给出 rateBp 或 fixedAmount: " + ruleId);
        }
        if (rateBp != null && (rateBp < 0 || rateBp > 10_000)) {
            throw new IllegalArgumentException("rateBp 必须在 0..10000: " + rateBp);
        }
        if (fixedAmount != null && fixedAmount < 0) {
            throw new IllegalArgumentException("fixedAmount 不能为负: " + fixedAmount);
        }
    }
}
