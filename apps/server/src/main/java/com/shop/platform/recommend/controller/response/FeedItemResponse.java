package com.shop.platform.recommend.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.product.api.ProductCardView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * feed 的卡片项：够渲染一张货架卡即可。
 *
 * <p>为什么不复用 product 的 PublicProductView：跨模块引用不到它（它在 product.controller 包，
 * 不是命名接口），而且 feed 的 item 契约本来就要能独立长大——V3 混排运营卡时这里会变成联合类型，
 * 不该和 /api/products 绑在同一个 record 上。
 *
 * <p>minPrice / maxPrice 刻意不标 nullable：召回只发上架商品，上架门槛保证每个在售 SKU 都已设价。
 */
@Schema(name = "FeedItemResponse")
public record FeedItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) UUID categoryId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
        @Schema(requiredMode = REQUIRED) Money minPrice,
        @Schema(requiredMode = REQUIRED) Money maxPrice,
        @Schema(requiredMode = REQUIRED) long soldCount) {

    public static FeedItemResponse from(ProductCardView card) {
        return new FeedItemResponse(
                card.id(),
                card.shopId(),
                card.categoryId(),
                card.name(),
                card.subtitle(),
                card.mainImage(),
                card.minPrice(),
                card.maxPrice(),
                card.soldCount());
    }
}
