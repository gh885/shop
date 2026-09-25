package com.shop.platform.cart.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cart.mapper.CartItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 条目出参：刻意不吐 userId（JWT 里就有，纯冗余）。前端 TS 类型尚未建立，
 * 是唯一可以从一开始就按最小契约设计的端点。
 */
@Schema(name = "CartItemResponse")
public record CartItemMutationView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID skuId,
        @Schema(requiredMode = REQUIRED) Integer quantity,
        @Schema(requiredMode = REQUIRED) Boolean selected,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static CartItemMutationView from(CartItem item) {
        return new CartItemMutationView(
                item.getId(),
                item.getSkuId(),
                item.getQuantity(),
                item.getSelected(),
                item.getCreatedAt(),
                item.getUpdatedAt());
    }
}
