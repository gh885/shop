package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 卖家侧店铺资料读模型；驳回理由只在列表/重提场景由调用方补充。 */
@Schema(name = "ShopResponse")
public record ShopView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID ownerId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String logoKey,
        @Schema(requiredMode = REQUIRED) ShopStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt,
        @Schema(requiredMode = REQUIRED, nullable = true, description = "最近一次审核驳回理由；仅被驳回的店铺非空") String rejectReason) {

    public static ShopView from(Shop shop) {
        return from(shop, null);
    }

    public static ShopView from(Shop shop, String rejectReason) {
        return new ShopView(
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
