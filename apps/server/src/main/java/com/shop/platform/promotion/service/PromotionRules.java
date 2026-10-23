package com.shop.platform.promotion.service;

import com.shop.platform.promotion.api.AppliedRule;
import com.shop.platform.promotion.api.PromotionQuery;
import com.shop.platform.promotion.mapper.PromotionRuleStore;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 生效规则的唯一实现：读规则表，映射成 {@link AppliedRule} 交给算价。
 *
 * <p>这里不做任何"算多少"的判断——{@code threshold / rate_bp / fixed_amount / base_mode} 原样带出去，
 * 怎么用是 {@code pricing} 的事。规则和算法分居两个模块，改玩法不用改这里。
 */
@Component
public class PromotionRules implements PromotionQuery {

    private final PromotionRuleStore store;

    public PromotionRules(PromotionRuleStore store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    /**
     * {@code merchantId} 暂时没用上：现在只有全平台规则。
     *
     * <p>要做「店铺专属活动」时，规则表加一列 {@code merchant_ids uuid[]}，这里多一个条件，
     * 算价一行都不用改——它本来就把 {@code merchantId} 传下来了。
     */
    @Override
    public List<AppliedRule> effectiveRules(List<UUID> categoryIds, UUID merchantId) {
        return store.effectiveRules(categoryIds);
    }
}
