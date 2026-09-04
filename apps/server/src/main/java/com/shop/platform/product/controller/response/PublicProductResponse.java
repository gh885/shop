package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.product.mapper.Product;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 列表项：够渲染一张商品卡片即可，详情独有的大字段（description/images）不进列表，省带宽。
 * 与卖家端 ProductAdminController 的同名 record 区分（若非同名，springdoc 会在 components.schemas 互相覆盖，
 * 买家端金额 Money 会被卖家端 Long 覆盖、混入 admin 字段）。 */
@Schema(name = "PublicProductResponse")
public record PublicProductResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID categoryId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
        @Schema(requiredMode = REQUIRED, nullable = true) Money minPrice,
        @Schema(requiredMode = REQUIRED, nullable = true) Money maxPrice) {

    public static PublicProductResponse from(Product p) {
        return new PublicProductResponse(
                p.getId(),
                p.getShopId(),
                p.getCategoryId(),
                p.getName(),
                p.getSubtitle(),
                p.getMainImage(),
                p.getMinPrice() == null ? null : Money.cny(p.getMinPrice()),
                p.getMaxPrice() == null ? null : Money.cny(p.getMaxPrice()));
    }
}
