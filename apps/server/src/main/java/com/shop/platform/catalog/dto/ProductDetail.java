package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 买家侧商品详情。只返回 online listing 覆盖的 SKU。 */
public record ProductDetail(
        UUID spuId,
        String title,
        UUID categoryId,
        UUID brandId,
        List<String> images,
        List<AttributeView> attributes,
        List<SkuView> skus,
        Money minPrice) {

    @Schema(name = "ProductAttributeView")
    public record AttributeView(String code, String value) {}

    /**
     * @param availableToPromise 现在还能卖几件。<b>默认仓的口径</b>，与下单预占问的是同一个仓——
     *     展示与成交必须同源，否则会出现「页面显示有 5，点下单说不够」。
     *     <p>允许为负（账上已超卖）：前端按「无货」展示，但不要把数据改写成 0，
     *     那是运维要看见的信号。
     *     <p>0 = 没建过库存行 或 卖光了。对买家这两件事没有区别，所以不区分。
     */
    @Schema(name = "ProductSkuView")
    public record SkuView(UUID skuId, Map<String, String> specs, Money price, int availableToPromise) {}
}
