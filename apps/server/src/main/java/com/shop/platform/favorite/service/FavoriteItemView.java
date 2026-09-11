package com.shop.platform.favorite.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 收藏夹条目视图：favorite.items 行 + 读取时拼装的商品卡片数据（现价/主图/在售状态）。
 *
 * <p>价格永远是「现在」的价格（降价要能被看见）；available = SPU 已上架，
 * 下架商品保留在列表里置灰，由用户手动移除。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record FavoriteItemView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED) OffsetDateTime favoritedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) ProductInfo product,
        @Schema(requiredMode = REQUIRED) boolean available) {

    /** 商品卡片信息：够渲染一张收藏卡片即可 */
    @Schema(name = "FavoriteProductInfo", description = "收藏条目里的商品卡片信息")
    public record ProductInfo(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
            @Schema(requiredMode = REQUIRED, nullable = true) Money minPrice,
            @Schema(requiredMode = REQUIRED, nullable = true) Money maxPrice,
            @Schema(requiredMode = REQUIRED) long collectCount) {}
}
