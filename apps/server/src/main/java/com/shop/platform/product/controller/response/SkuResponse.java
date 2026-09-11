package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuAttr;
import com.shop.platform.product.model.SkuStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** SKU 全字段出参：比买家侧多 skuCode/status（卖家要看到仓管编码与停用态）；价格裸分直传，与前端 schema 对齐 */
public record SkuResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED, nullable = true) String skuCode,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) List<SkuAttr> attributes,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED, nullable = true) Long price,
        @Schema(requiredMode = REQUIRED, nullable = true) Long originalPrice,
        @Schema(requiredMode = REQUIRED) String currency,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) SkuStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

    public static SkuResponse from(Sku s, StockView stock) {
        return new SkuResponse(
                s.getId(),
                s.getProductId(),
                s.getSkuCode(),
                s.getName(),
                s.getAttributes(),
                s.getImage(),
                s.getPrice(),
                s.getOriginalPrice(),
                s.getCurrency(),
                stock == null ? 0 : stock.availableStock(),
                s.getStatus(),
                s.getCreatedAt(),
                s.getUpdatedAt());
    }
}
