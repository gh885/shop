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

    /**
     * @param skuStocks   详情展示行的可用库存（skuId → StockView，缺失按 0）
     * @param productStock SPU 那一栏的库存总量，由调用方按列表行同一口径算好交进来（含对账停用的残留行，
     *                     故不能就地拿 {@code skuStocks} 求和——那会和卖家列表里的同名字段两个数）
     */
    public static ProductDetailView from(ProductDetail d, Map<UUID, StockView> skuStocks, int productStock) {
        return new ProductDetailView(
                ProductView.from(d.product(), productStock),
                d.skus().stream()
                        .map(s -> SkuView.from(s, skuStocks.get(s.getId())))
                        .toList());
    }
}
