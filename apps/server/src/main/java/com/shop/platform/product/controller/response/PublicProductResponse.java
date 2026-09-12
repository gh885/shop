package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.product.mapper.Product;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 列表项：够渲染一张商品卡片即可，详情独有的大字段（description/images）不进列表，省带宽。
 * 与卖家端 ProductAdminController 的同名 record 区分（若非同名，springdoc 会在 components.schemas 互相覆盖，
 * 买家端金额 Money 会被卖家端 Long 覆盖、混入 admin 字段）。
 *
 * <p><b>minPrice/maxPrice 刻意不标 nullable</b>：买家侧只可能看到 PUBLISHED 商品（非上架在 publicDetail 一律 404），
 * 而发布与重上（{@code ensurePublishable}）、改 SKU（price 必填且复算区间）三道门保证「每个在售 SKU 都已设价」，
 * {@code ensureNotAllOutOfStock} 又保证至少一个在售 SKU 在有货。所以区间在这里不可能为空，标可空是过度声明：
 * 生成物会凭空多出前端分支，真出契约事故时反而少了 zod 这道闸。卖家端 ProductResponse 的同名字段仍是可空的
 * ——草稿期确实没价。 */
@Schema(name = "PublicProductResponse")
public record PublicProductResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID categoryId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
        @Schema(requiredMode = REQUIRED) Money minPrice,
        @Schema(requiredMode = REQUIRED) Money maxPrice) {

    public static PublicProductResponse from(Product p) {
        return new PublicProductResponse(
                p.getId(),
                p.getShopId(),
                p.getCategoryId(),
                p.getName(),
                p.getSubtitle(),
                p.getMainImage(),
                Money.cnyOrNull(p.getMinPrice()),
                Money.cnyOrNull(p.getMaxPrice()));
    }
}
