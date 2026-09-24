package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 类目属性值入参，平台预置建档与改名共用 */
public record CategoryAttrValueRequest(
        @NotBlank @Size(max = CategoryFieldRules.ATTR_VALUE_MAX) String value,
        Integer sort,
        @Size(max = CategoryFieldRules.ATTR_VALUE_IMAGE_MAX) String image) {
    public CategoryAttrValueRequest {
        if (value != null) value = value.trim();
    }
}
