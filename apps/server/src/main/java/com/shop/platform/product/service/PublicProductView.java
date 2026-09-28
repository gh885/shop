package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.product.mapper.Product;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 列表项：够渲染一张商品卡片即可，详情独有的大字段（description/images）不进列表，省带宽。
 * 与卖家端 ProductView 区分（同名 record 会让 springdoc 在 components.schemas 互相覆盖）。
 *
 * <p><b>minPrice/maxPrice 刻意不标 nullable</b>：买家侧只可能看到 PUBLISHED 商品（非上架在 publicDetail 一律 404），
 * 而发布与重上（{@code ensurePublishable}）、改 SKU（price 必填且复算区间）三道门保证「每个在售 SKU 都已设价」，
 * {@code ensureNotAllOutOfStock} 又保证至少一个在售 SKU 在有货。所以区间在这里不可能为空，标可空是过度声明：
 * 生成物会凭空多出前端分支，真出契约事故时反而少了 zod 这道闸。卖家端 ProductView 的同名字段仍是可空的
 * ——草稿期确实没价。 */
@Schema(name = "PublicProductResponse")
public record PublicProductView(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID shopId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID categoryId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED, nullable = true) String mainImage,
        @Schema(requiredMode = REQUIRED) Money minPrice,
        @Schema(requiredMode = REQUIRED) Money maxPrice,
        @Schema(requiredMode = REQUIRED) long soldCount,
        /** 是否支持七天无理由退货：详情页那枚服务徽标吃这个字段，不再由前端写死一句承诺 */
        @Schema(requiredMode = REQUIRED) boolean sevenDayReturn) {

    public static PublicProductView from(Product p) {
        return new PublicProductView(
                p.getId(),
                p.getShopId(),
                p.getCategoryId(),
                p.getName(),
                p.getSubtitle(),
                p.getMainImage(),
                p.minPriceAsMoney(),
                p.maxPriceAsMoney(),
                p.getSoldCount(),
                p.isSevenDayReturn());
    }
}
