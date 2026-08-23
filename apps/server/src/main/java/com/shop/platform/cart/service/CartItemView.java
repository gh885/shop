package com.shop.platform.cart.service;

import com.shop.platform.common.Money;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 购物车条目视图：cart.items 行 + 读取时拼装的展示数据（现价/库存/店铺）。
 *
 * <p>available = SPU 已上架 && SKU 在售。失效条目（下架/停售/被删）保留在列表里置灰，
 * 由用户手动清除（电商惯例：让用户看见「没了」，自己决定清不清），前端据 available 置灰。
 */
public record CartItemView(
        UUID id,
        UUID skuId,
        Integer quantity,
        Boolean selected,
        OffsetDateTime addedAt,
        ProductInfo product,
        SkuInfo sku,
        boolean available) {

    /** 商品（SPU）侧信息：卡片标题/主图/店铺分组都靠它 */
    public record ProductInfo(UUID id, String name, String mainImage, UUID shopId, String shopName) {}

    /** SKU 侧信息：价格永远是「现在」的价格，stock=0 前端标缺货，status 前端区分停售文案 */
    public record SkuInfo(
            UUID id, String name, String image, Money price, Money originalPrice, Integer stock, Integer status) {}
}
