package com.shop.platform.product.mapper;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 销售属性维度 {attrId, name, values}，SKU 按各维取值笛卡尔积生成。
 *
 * <p>product.specs 列（JSONB）的元素形状。attrId/valueId 是身份（指向类目属性模板）， name/value 是从模板读出的显示快照——模板改名后快照在下一次 updateSpecs 时重写。
 */
public record SpecItem(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID attrId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SpecValue> values) {}
