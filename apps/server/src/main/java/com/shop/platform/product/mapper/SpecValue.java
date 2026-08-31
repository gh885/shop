package com.shop.platform.product.mapper;

import java.util.UUID;

/**
 * 规格值 {valueId, value}：product.specs 列（JSONB）里 SpecItem.values 的元素形状。
 *
 * <p>valueId 是身份（指向 product.category_attr_values），value 只是显示快照——规格值改名只动快照， SKU 身份（skus.spec_key）不受影响。
 */
public record SpecValue(UUID valueId, String value) {}
