package com.shop.platform.product.api;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

/**
 * 商品累计销量查询接口（依赖倒置）：由 product 模块定义，由 order 模块实现。
 * 从而彻底解决 product ↔ order 的循环依赖问题。
 */
public interface ProductSoldQuery {

    /**
     * 按店铺批查各商品的累计已售数量：返回 productId → SUM(quantity)。
     * 缺失的商品（零销量/未返回）不在 Map 中，消费方按 0 兜底。
     */
    Map<UUID, Long> soldCountByProductIds(UUID shopId, Collection<UUID> productIds);
}
