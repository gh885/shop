package com.shop.platform.promotion.service;

import com.shop.platform.promotion.api.AppliedRule;
import com.shop.platform.promotion.api.PromotionQuery;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * promotion 还没开工时的兜底：一条规则都没有。
 *
 * <p><b>这不是实现，是占位。</b>促销活动表、券生命周期全都没做，所以算价现在只会算出原价 + 运费。
 * 它存在的唯一理由是让 {@link PromotionQuery} 有个注入点，否则 pricing 起不来、整条链路连"没有优惠"都跑不通。
 *
 * <p>写真实规则时删掉这个类——那时 {@code promotion} 会自己提供 {@code PromotionQuery} 的实现，
 * 两个 {@code @Component} 同时存在会让 Spring 在启动时就报歧义，而不是悄悄用错那个。
 */
@Component
public class NoPromotionRules implements PromotionQuery {

    @Override
    public List<AppliedRule> effectiveRules(List<UUID> categoryIds, UUID merchantId) {
        return List.of();
    }
}
