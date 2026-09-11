package com.shop.platform.cart.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 购物车条目视图：cart.items 行 + 读取时拼装的展示数据（现价/库存/店铺）。
 *
 * <p>available = SPU 已上架 && SKU 在售。失效条目（下架/停售/被删）保留在列表里置灰，
 * 由用户手动清除（电商惯例：让用户看见「没了」，自己决定清不清），前端据 available 置灰。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record CartItemView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID skuId,
        @Schema(requiredMode = REQUIRED) Integer quantity,
        @Schema(requiredMode = REQUIRED) Boolean selected,
        @Schema(requiredMode = REQUIRED) OffsetDateTime addedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) ProductInfo product,
        @Schema(requiredMode = REQUIRED, nullable = true) SkuInfo sku,
        @Schema(requiredMode = REQUIRED) boolean available) {

    /** 商品（SPU）侧信息：卡片标题/主图/店铺分组都靠它 */
    @Schema(name = "CartProductInfo", description = "购物车条目里的商品（SPU）信息")
    public record ProductInfo(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
            @Schema(requiredMode = REQUIRED) UUID shopId,
            @Schema(requiredMode = REQUIRED) String shopName) {}

    /** SKU 侧信息：价格永远是「现在」的价格，stock=0 前端标缺货，status 前端区分停售文案 */
    public record SkuInfo(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String image,
            @Schema(requiredMode = REQUIRED) Money price,
            @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
            @Schema(requiredMode = REQUIRED) Integer stock,
            @Schema(requiredMode = REQUIRED) boolean onSale) {}
}
