package com.shop.platform.governance.service;

import com.shop.platform.governance.api.GovernanceQuery;
import com.shop.platform.governance.api.SellDecision;
import com.shop.platform.governance.mapper.GovernanceMapper;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 售卖资格的唯一判定实现。
 *
 * <p>顺序是有意的：商家状态 → 类目授权 → 品牌授权 → 资质。先给出最少依赖的拒绝原因，
 * 调用方不需要知道后面几项。
 */
@Component
public class GovernanceEligibility implements GovernanceQuery {

    private final GovernanceMapper store;

    public GovernanceEligibility(GovernanceMapper store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    @Override
    public SellDecision canSell(UUID merchantId, UUID categoryId, UUID brandId, List<String> qualificationCodes) {
        Objects.requireNonNull(merchantId, "merchantId");
        Objects.requireNonNull(categoryId, "categoryId");

        GovernanceMapper.Checks checks = store.check(merchantId, categoryId, brandId);
        if (!checks.profileOk()) {
            return SellDecision.deny(SellDecision.MERCHANT_NOT_ACTIVE);
        }
        if (!checks.categoryOk()) {
            return SellDecision.deny(SellDecision.CATEGORY_NOT_GRANTED);
        }
        if (brandId != null && !checks.brandOk()) {
            return SellDecision.deny(SellDecision.BRAND_NOT_GRANTED);
        }
        // 类目要求的资质必须逐项都有。原来这里只判"有没有任意一条 valid 的资质"，
        // 于是商家拿一张食品经营许可就能卖手机——类目配的 qualification_codes 从没被读过
        List<String> missing = store.missingCredentials(merchantId, categoryId, qualificationCodes);
        if (!missing.isEmpty()) {
            return SellDecision.deny(SellDecision.CREDENTIAL_MISSING);
        }
        return SellDecision.allow();
    }
}
