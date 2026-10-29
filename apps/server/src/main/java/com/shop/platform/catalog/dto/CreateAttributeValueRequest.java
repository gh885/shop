package com.shop.platform.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 新增一个属性值。值文本创建后不改名——它进识别键。 */
public record CreateAttributeValueRequest(
        @NotBlank @Size(max = 64) String value, @Size(max = 1024) String imageUrl, Integer sort) {

    public int sortOrDefault() {
        return sort == null ? 0 : sort;
    }
}
