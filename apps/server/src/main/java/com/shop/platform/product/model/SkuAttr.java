package com.shop.platform.product.model;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * SKU 规格取值 {attrId, valueId, name, value}：skus.attributes 列（JSONB）的元素形状。
 *
 * <p>attrId/valueId 是身份（SKU 的唯一性由 spec_key 列承担，不依赖本列整体比较）； name/value 是快照冗余，订单/展示免 join。规格值改名由 CategoryAttrService.updateValue 同事务刷新快照。 不与 ParamItem 复用：参数无 valueId，形状已分叉。
 */
public record SkuAttr(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID attrId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID valueId,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String value) {}
