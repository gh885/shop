package com.shop.platform.favorite.service;

import com.shop.platform.common.Money;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 收藏夹条目视图：favorite.items 行 + 读取时拼装的商品卡片数据（现价/主图/在售状态）。
 *
 * <p>价格永远是「现在」的价格（降价要能被看见）；available = SPU 已上架，
 * 下架商品保留在列表里置灰，由用户手动移除。
 */
public record FavoriteItemView(
        UUID id, UUID productId, OffsetDateTime favoritedAt, ProductInfo product, boolean available) {

    /** 商品卡片信息：够渲染一张收藏卡片即可 */
    public record ProductInfo(
            UUID id, String name, String mainImage, Money minPrice, Money maxPrice, long collectCount) {}
}
