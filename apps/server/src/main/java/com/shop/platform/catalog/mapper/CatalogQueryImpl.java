package com.shop.platform.catalog.mapper;

import com.shop.platform.catalog.api.CatalogQuery;
import java.util.Collection;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 可售事实的点查。实现 {@link CatalogQuery}，因为它是 catalog 对外的只读入口。
 *
 * <p>一次 JOIN 拿全：SPU、SKU、online listing 三张表在同一个库同一个事务里，分开查只会多出竞态。
 * SQL 与行形状住在 {@link SkuMapper#findSellable} 与 {@link SpuMapper#findSellableSpusByIds}。
 */
@Component
public class CatalogQueryImpl implements CatalogQuery {

    private final SkuMapper skus;
    private final SpuMapper spus;

    public CatalogQueryImpl(SkuMapper skus, SpuMapper spus) {
        this.skus = Objects.requireNonNull(skus, "skus");
        this.spus = Objects.requireNonNull(spus, "spus");
    }

    @Override
    public Optional<SellableSku> findSellable(UUID skuId) {
        return skus.findSellable(skuId).map(SkuMapper.SellableRow::toSellable);
    }

    @Override
    public Map<UUID, SellableSku> findSellableByIds(Collection<UUID> skuIds) {
        if (skuIds.isEmpty()) {
            return Map.of();
        }
        return skus.findSellableByIds(skuIds).stream()
                .collect(Collectors.toUnmodifiableMap(SkuMapper.SellableRow::id, SkuMapper.SellableRow::toSellable));
    }

    /**
     * 空集合直接返回空 Map，不打库——调用方（收藏列表第一页为空、购物车为空）不该为此付一次往返。
     *
     * <p>价格在这里组装成 {@link com.shop.platform.common.money.Money}：SQL 里拿的是两列原始形状，
     * 模块边界上只有一个金额形状。币种列可空与金额列可空同生同死（有 SKU 才有价格），
     * 所以两者一起判。
     */
    @Override
    public Map<UUID, SellableSpu> findSellableSpusByIds(Collection<UUID> spuIds) {
        if (spuIds.isEmpty()) {
            return Map.of();
        }
        return spus.findSellableSpusByIds(spuIds).stream()
                .collect(Collectors.toUnmodifiableMap(
                        SpuMapper.SellableSpuRow::spuId,
                        row -> new SellableSpu(
                                row.spuId(),
                                row.title(),
                                row.imageUrl(),
                                row.minPriceAmount() == null
                                        ? null
                                        : new com.shop.platform.common.money.Money(
                                                row.minPriceAmount(), row.minPriceCurrency()))));
    }
}
