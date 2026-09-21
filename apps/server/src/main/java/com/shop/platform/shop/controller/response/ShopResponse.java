package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 店铺出参（仅卖家侧 /shops 使用；买家侧走 PublicShopResponse 另有一只） */
public record ShopResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID ownerId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String logoKey,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ShopStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt,
        @Schema(requiredMode = REQUIRED, nullable = true, description = "最近一次审核驳回理由；仅被驳回的店铺非空") String rejectReason) {

    public static ShopResponse from(Shop shop) {
        return from(shop, null);
    }

    public static ShopResponse from(Shop shop, String rejectReason) {
        return new ShopResponse(
                shop.getId(),
                shop.getOwnerId(),
                shop.getName(),
                shop.getLogoKey(),
                shop.getStatus(),
                shop.getCreatedAt(),
                shop.getUpdatedAt(),
                rejectReason);
    }
}
