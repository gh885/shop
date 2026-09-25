package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.SkuAttr;
import com.shop.platform.product.model.SkuStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * SKU 全字段出参：比买家侧多 skuCode/status（卖家要看到仓管编码与停用态）。
 * 价格以 Money 出参（与入参 {@code SkuUpdateItem} 同一口径，币种不再单列一栏）。
 */
@Schema(name = "SkuResponse")
public record SkuView(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED, nullable = true) String skuCode,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) List<SkuAttr> attributes,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED, nullable = true) Money price,
        @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) SkuStatus status,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

    public static SkuView from(Sku s, StockView stock) {
        return new SkuView(
                s.getId(),
                s.getProductId(),
                s.getSkuCode(),
                s.getName(),
                s.getAttributes(),
                s.getImage(),
                s.priceAsMoney(),
                s.originalPriceAsMoney(),
                StockView.availableOrZero(stock),
                s.getStatus(),
                s.getCreatedAt(),
                s.getUpdatedAt());
    }
}
