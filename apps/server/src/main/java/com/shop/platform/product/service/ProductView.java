package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.model.ParamItem;
import com.shop.platform.product.model.ProductStatus;
import com.shop.platform.product.model.SpecItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** SPU 全字段出参：价格区间以 Money 出参，草稿期 minPrice/maxPrice 可为 null */
@Schema(name = "ProductResponse")
public record ProductView(
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
        /** 可售库存：该商品全部 SKU 可用量之和（表上没有这一列，由 ProductQueryService 经 inventory 批查补齐） */
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Long soldCount,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) ProductStatus status,
        /** 是否支持七天无理由退货（卖家可声明除外；改它只影响之后的订单，历史订单行的快照不变） */
        @Schema(requiredMode = REQUIRED) boolean sevenDayReturn,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) OffsetDateTime updatedAt) {

    /**
     * 单商品投影：库存由调用方给真实值，不在这里回默认为 0。
     *
     * <p>{@code products} 表没有库存列（库存在 inventory 模块），所以这一个数只能问出来、不能从实体读。
     * 这里曾写死 0：同一个 {@code stock} 字段在卖家列表里是真实可售量、在创建/编辑/发布/上下架的响应里恒 0，
     * 前端无从分辨哪个是真的。取数口收在 {@code ProductQueryService}（与列表行同一口径）。
     */
    public static ProductView from(Product p, int stock) {
        return new ProductView(
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
                stock,
                p.getSoldCount(),
                p.getStatus(),
                p.isSevenDayReturn(),
                p.getCreatedAt(),
                p.getUpdatedAt());
    }

    /** 卖家工作台列表行：SPU 字段 + 库存/销量指标 */
    public static ProductView from(ProductListRow row) {
        Product p = row.product();
        return new ProductView(
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
