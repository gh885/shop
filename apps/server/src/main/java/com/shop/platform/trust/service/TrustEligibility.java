package com.shop.platform.trust.service;

import com.shop.platform.trust.api.SellDecision;
import com.shop.platform.trust.api.TrustQuery;
import com.shop.platform.trust.mapper.TrustStore;
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
public class TrustEligibility implements TrustQuery {

    private final TrustStore store;

    public TrustEligibility(TrustStore store) {
        this.store = Objects.requireNonNull(store, "store");
    }

    @Override
    public SellDecision canSell(UUID merchantId, UUID categoryId, UUID brandId) {
        Objects.requireNonNull(merchantId, "merchantId");
        Objects.requireNonNull(categoryId, "categoryId");

        TrustStore.Checks checks = store.check(merchantId, categoryId, brandId);
        if (!checks.profileOk()) {
            return SellDecision.deny(SellDecision.MERCHANT_NOT_ACTIVE);
        }
        if (!checks.categoryOk()) {
            return SellDecision.deny(SellDecision.CATEGORY_NOT_GRANTED);
        }
        if (brandId != null && !checks.brandOk()) {
            return SellDecision.deny(SellDecision.BRAND_NOT_GRANTED);
        }
        if (!checks.credentialOk()) {
            return SellDecision.deny(SellDecision.CREDENTIAL_EXPIRED);
        }
        return SellDecision.allow();
    }
}
