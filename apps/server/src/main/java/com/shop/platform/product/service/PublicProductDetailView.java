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
 * 买家端商品详情出参。
 *
 * <p>Public 前缀的由来：卖家端 {@code ProductAdminController} 也有同名出参（金额是裸 Long、还带 admin
 * 字段）。两个 record 若同名，springdoc 按简单类名生成 components.schemas 会互相覆盖——买家端的 Money 会被
 * 卖家端的 Long 顶掉。故买家端出参加 Public 前缀，并用 {@code @Schema(name = ...)} 把契约名钉死，
 * 使 Java 侧重命名不再牵动前端 SDK。
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
