package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 店铺对外信息：隐藏 ownerId 与 status（内部治理字段，且非 ACTIVE 根本查不到） */
@Schema(name = "PublicShopResponse")
public record PublicShopResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String logoKey,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
