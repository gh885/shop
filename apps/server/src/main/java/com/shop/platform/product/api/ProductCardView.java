package com.shop.platform.product.api;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 商品卡投影：货架卡要渲染的那几列，供 feed 召回逐行装配。
 *
 * <p>与 {@link ProductView} 分开是有意的：那边是「分组 + 可用性」视图（带 status，消费方要判
 * {@code published()} / {@code onSale()}），这里是「一张卡片」——有 subtitle / categoryId / soldCount，
 * 不带 status：能出现在召回结果里的都是上架商品，可用性在这里没有问题可问。
 *
 * <p>价格是 Money（币种随行读出，不靠消费方补）。召回只发上架商品，而上架门槛保证每个在售 SKU 都已设价，
 * 所以两端在契约层是非空（见 PublicProductResponse 的口径说明）。
 */
public record ProductCardView(
        UUID id,
        UUID shopId,
        UUID categoryId,
        String name,
        String subtitle,
        String mainImage,
        Money minPrice,
        Money maxPrice,
        long soldCount) {}
