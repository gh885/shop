package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 我的店铺列表行：已拍平的 HTTP 契约形状，不再包 mapper 实体后由 controller 二次转换。
 *
 * <p>理由只在店铺当前状态为 REJECTED 时非空。组件名继续叫 ShopResponse，避免只改 Java 形状却让生成 SDK 改名。
 */
@Schema(name = "ShopResponse")
public record ShopListItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID ownerId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String logoKey,
        @Schema(requiredMode = REQUIRED) ShopStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) String rejectReason) {

    public static ShopListItem from(Shop shop, String rejectReason) {
        return new ShopListItem(
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
