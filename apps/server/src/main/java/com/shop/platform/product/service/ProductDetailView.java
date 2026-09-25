package com.shop.platform.product.service;

import com.shop.platform.inventory.api.StockView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 详情出参：SPU + 全部 SKU，替代 service 层的 ProductDetail（其内嵌 mapper 实体，不得越过 HTTP 边界） */
@Schema(name = "ProductDetailResponse")
public record ProductDetailView(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProductView product,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SkuView> skus) {

    public static ProductDetailView from(ProductDetail d, Map<UUID, StockView> stocks) {
        return new ProductDetailView(
                ProductView.from(d.product()),
                d.skus().stream()
                        .map(s -> SkuView.from(s, stocks.get(s.getId())))
                        .toList());
    }
}
