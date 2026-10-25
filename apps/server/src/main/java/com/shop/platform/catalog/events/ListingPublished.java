package com.shop.platform.catalog.events;

import com.shop.platform.common.event.DomainEvent;
import com.shop.platform.common.money.Money;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 商品上架事实。搜索、推荐、比价聚合都消费它，不回查 catalog。
 *
 * <p>一个 SPU 一条事件，不是每个 SKU 一条：按 SKU 发会重复 90% 的字段，
 * 一个 40 规格的连衣裙就是 40 条。
 */
public record ListingPublished(
        UUID eventId,
        UUID listingId,
        UUID merchantId,
        UUID spuId,
        List<UUID> skuIds,
        UUID categoryId,
        Money minPrice,
        Instant publishedAt)
        implements DomainEvent {}
