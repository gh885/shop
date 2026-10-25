package com.shop.platform.catalog.dto;

import com.shop.platform.common.money.Money;
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

    public record AttributeView(String code, String value) {}

    public record SkuView(UUID skuId, Map<String, String> specs, Money price) {}
}
