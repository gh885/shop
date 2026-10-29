package com.shop.platform.catalog.dto;

import jakarta.validation.constraints.Size;

/** 改属性值的图片 / 排序 / 启停；{@code null} = 不改。值文本不可改。 */
public record UpdateAttributeValueRequest(@Size(max = 1024) String imageUrl, Integer sort, String status) {}
