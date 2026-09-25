package com.shop.platform.favorite.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.favorite.mapper.FavoriteItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 收藏行出参：刻意不吐 userId（JWT 冗余），按 HTTP 契约规范禁止裸吐实体 */
@Schema(name = "FavoriteItemResponse")
public record FavoriteItemMutationView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static FavoriteItemMutationView from(FavoriteItem item) {
        return new FavoriteItemMutationView(item.getId(), item.getProductId(), item.getCreatedAt());
    }
}
