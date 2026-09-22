package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.SpecItem;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.service.ProductListRow;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** SPU 全字段出参：价格区间以 Money 出参，草稿期 minPrice/maxPrice 可为 null */
public record ProductResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID categoryId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED) List<String> detailImages,
        @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
        @Schema(requiredMode = REQUIRED) List<String> images,
        @Schema(requiredMode = REQUIRED) List<SpecItem> specs,
        @Schema(requiredMode = REQUIRED) List<ParamItem> params,
        @Schema(requiredMode = REQUIRED, nullable = true) Money minPrice,
        @Schema(requiredMode = REQUIRED, nullable = true) Money maxPrice,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Long soldCount,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProductStatus status,
        /** 是否支持七天无理由退货（卖家可声明除外；改它只影响之后的订单，历史订单行的快照不变） */
        @Schema(requiredMode = REQUIRED) boolean sevenDayReturn,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

    public static ProductResponse from(Product p) {
        return new ProductResponse(
                p.getId(),
                p.getShopId(),
                p.getCategoryId(),
                p.getName(),
                p.getSubtitle(),
                p.getDetailImages(),
                p.getMainImage(),
                p.getImages(),
                p.getSpecs(),
                p.getParams(),
                p.minPriceAsMoney(),
                p.maxPriceAsMoney(),
                0,
                p.getSoldCount(),
                p.getStatus(),
                p.isSevenDayReturn(),
                p.getCreatedAt(),
                p.getUpdatedAt());
    }

    /** 卖家工作台列表行：SPU 字段 + 库存/销量指标 */
    public static ProductResponse from(ProductListRow row) {
        Product p = row.product();
        return new ProductResponse(
                p.getId(),
                p.getShopId(),
                p.getCategoryId(),
                p.getName(),
                p.getSubtitle(),
                p.getDetailImages(),
                p.getMainImage(),
                p.getImages(),
                p.getSpecs(),
                p.getParams(),
                p.minPriceAsMoney(),
                p.maxPriceAsMoney(),
                row.stock(),
                row.soldCount(),
                p.getStatus(),
                p.isSevenDayReturn(),
                p.getCreatedAt(),
                p.getUpdatedAt());
    }
}
