package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 店铺出参：字段镜像实体现状（前端 ShopSchema 严格校验，只减不增） */
public record ShopResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID ownerId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String logoKey,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ShopStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

    public static ShopResponse from(Shop shop) {
        return new ShopResponse(
                shop.getId(),
                shop.getOwnerId(),
                shop.getName(),
                shop.getLogoKey(),
                shop.getStatus(),
                shop.getCreatedAt(),
                shop.getUpdatedAt());
    }
}
