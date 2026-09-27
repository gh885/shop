package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 管理端店铺列表的一行（wire 契约：字段只减不增）。 */
@Schema(description = "管理端店铺列表项")
public record AdminShopItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) UUID ownerId,
        @Schema(requiredMode = REQUIRED) String status,
        String logoKey,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
