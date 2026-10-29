package com.shop.platform.seller.mapper;

import com.shop.platform.seller.api.MerchantQuery;
import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** 商家点查的实现：主体名称只从 {@link MerchantOnboardingMapper} 出。 */
@Component
public class MerchantQueryImpl implements MerchantQuery {

    private final MerchantOnboardingMapper merchants;

    public MerchantQueryImpl(MerchantOnboardingMapper merchants) {
        this.merchants = Objects.requireNonNull(merchants, "merchants");
    }

    @Override
    public Map<UUID, String> namesByIds(Collection<UUID> merchantIds) {
        if (merchantIds.isEmpty()) {
            return Map.of();
        }
        return merchants.findMerchantNames(merchantIds).stream()
                .collect(Collectors.toUnmodifiableMap(
                        MerchantOnboardingMapper.MerchantNameRow::id, MerchantOnboardingMapper.MerchantNameRow::name));
    }
}
