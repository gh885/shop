package com.shop.platform.cart.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cart.service.CartItemView;
import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 列表条目出参：镜像 service 的 CartItemView（行字段 + 拼装展示数据），字段只减不增 */
public record CartListItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID skuId,
        @Schema(requiredMode = REQUIRED) Integer quantity,
        @Schema(requiredMode = REQUIRED) Boolean selected,
        @Schema(requiredMode = REQUIRED) OffsetDateTime addedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) ProductInfo product,
        @Schema(requiredMode = REQUIRED, nullable = true) SkuInfo sku,
        @Schema(requiredMode = REQUIRED) boolean available) {

    public static CartListItemResponse from(CartItemView view) {
        return new CartListItemResponse(
                view.id(),
                view.skuId(),
                view.quantity(),
                view.selected(),
                view.addedAt(),
                ProductInfo.from(view.product()),
                SkuInfo.from(view.sku()),
                view.available());
    }

    @Schema(name = "CartProductInfo", description = "购物车条目里的商品（SPU）信息")
    public record ProductInfo(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
            @Schema(requiredMode = REQUIRED) UUID shopId,
            @Schema(requiredMode = REQUIRED) String shopName) {

        /** SPU 被删/下架时 service 侧该段为 null，据契约透传 null（前端据 available 置灰） */
        public static ProductInfo from(CartItemView.ProductInfo info) {
            if (info == null) return null;
            return new ProductInfo(info.id(), info.name(), info.mainImage(), info.shopId(), info.shopName());
        }
    }

    public record SkuInfo(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String name,
            @Schema(requiredMode = REQUIRED, nullable = true) String image,
            @Schema(requiredMode = REQUIRED) Money price,
            @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
            @Schema(requiredMode = REQUIRED) Integer stock,
            @Schema(requiredMode = REQUIRED) boolean onSale) {

        /** SKU 被删/停售时 service 侧该段为 null，据契约透传 null */
        public static SkuInfo from(CartItemView.SkuInfo info) {
            if (info == null) return null;
            return new SkuInfo(
                    info.id(),
                    info.name(),
                    info.image(),
                    info.price(),
                    info.originalPrice(),
                    info.stock(),
                    info.onSale());
        }
    }
}
