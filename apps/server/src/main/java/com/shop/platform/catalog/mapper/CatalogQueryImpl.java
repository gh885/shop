package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.api.CatalogQuery;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 可售事实的点查。实现 {@link CatalogQuery}，因为它是 catalog 对外的只读入口。
 *
 * <p>一次 JOIN 拿全：SPU、SKU、online offer 三张表在同一个库同一个事务里，分开查只会多出竞态。
 * SQL 与行形状住在 {@link SkuMapper#findSellable}。
 */
@Component
public class CatalogQueryImpl implements CatalogQuery {

    private final SkuMapper skus;

    public CatalogQueryImpl(SkuMapper skus) {
        this.skus = Objects.requireNonNull(skus, "skus");
    }

    @Override
    public Optional<SellableSku> findSellable(UUID skuId) {
        return skus.findSellable(skuId).map(SkuMapper.SellableRow::toSellable);
    }
}
