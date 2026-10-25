package com.shop.platform.seller.mapper;

import com.shop.platform.seller.api.ShopQuery;
import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** 店铺点查的实现：店铺是 seller 的表，名字只从 {@link ShopMapper} 出。 */
@Component
public class ShopQueryImpl implements ShopQuery {

    private final ShopMapper shops;

    public ShopQueryImpl(ShopMapper shops) {
        this.shops = Objects.requireNonNull(shops, "shops");
    }

    @Override
    public Optional<String> nameOf(UUID shopId) {
        return shops.findName(shopId);
    }

    @Override
    public Map<UUID, String> namesByIds(Collection<UUID> shopIds) {
        if (shopIds.isEmpty()) {
            return Map.of();
        }
        return shops.findNames(shopIds).stream()
                .collect(Collectors.toUnmodifiableMap(ShopMapper.NameRow::id, ShopMapper.NameRow::name));
    }
}
