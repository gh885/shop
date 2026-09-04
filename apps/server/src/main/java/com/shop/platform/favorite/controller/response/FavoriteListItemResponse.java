package com.shop.platform.favorite.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.favorite.service.FavoriteItemView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 列表条目出参：镜像 service 的 FavoriteItemView，字段只减不增 */
public record FavoriteListItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED) OffsetDateTime favoritedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) ProductInfo product,
        @Schema(requiredMode = REQUIRED) boolean available) {

    public static FavoriteListItemResponse from(FavoriteItemView view) {
        return new FavoriteListItemResponse(
                view.id(), view.productId(), view.favoritedAt(), ProductInfo.from(view.product()), view.available());
    }

    @Schema(name = "FavoriteProductInfo", description = "收藏条目里的商品卡片信息")
    public record ProductInfo(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
            @Schema(requiredMode = REQUIRED, nullable = true) Money minPrice,
            @Schema(requiredMode = REQUIRED, nullable = true) Money maxPrice,
            @Schema(requiredMode = REQUIRED) long collectCount) {

        /** 商品被删/下架时 service 侧该段为 null，据契约透传 null（前端据 available 置灰） */
        public static ProductInfo from(FavoriteItemView.ProductInfo info) {
            if (info == null) return null;
            return new ProductInfo(
                    info.id(), info.name(), info.mainImage(), info.minPrice(), info.maxPrice(), info.collectCount());
        }
    }
}
