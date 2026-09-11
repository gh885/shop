package com.shop.platform.product.controller.response;

import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.service.ProductDetail;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 详情出参：SPU + 全部 SKU，替代 service 层的 ProductDetail（其内嵌 mapper 实体，不得越过 HTTP 边界） */
public record ProductDetailResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProductResponse product,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SkuResponse> skus) {

    public static ProductDetailResponse from(ProductDetail d, Map<UUID, StockView> stocks) {
        return new ProductDetailResponse(
                ProductResponse.from(d.product()),
                d.skus().stream()
                        .map(s -> SkuResponse.from(s, stocks.get(s.getId())))
                        .toList());
    }
}
