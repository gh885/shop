package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.model.SpecItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 买家端商品详情出参。类名带 Public 前缀与卖家端出参区分（同名 record 会让 springdoc 在
 * components.schemas 互相覆盖）；{@code @Schema(name = ...)} 钉死契约名，Java 侧重命名不再牵动前端 SDK。
 */
@Schema(name = "PublicProductDetailResponse")
public record PublicProductDetailView(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) PublicProductView product,
        @Schema(requiredMode = REQUIRED) List<String> detailImages,
        @Schema(requiredMode = REQUIRED) List<String> images,
        @Schema(requiredMode = REQUIRED) List<SpecItem> specs,
        @Schema(requiredMode = REQUIRED) List<ParamItem> params,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<PublicSkuView> skus) {

    public static PublicProductDetailView from(ProductDetail d, Map<UUID, StockView> stocks) {
        Product p = d.product();
        return new PublicProductDetailView(
                PublicProductView.from(p),
                p.getDetailImages(),
                p.getImages(),
                p.getSpecs(),
                p.getParams(),
                d.skus().stream()
                        .map(s -> PublicSkuView.from(s, stocks.get(s.getId())))
                        .toList());
    }
}
