package com.shop.platform.product.controller;

import com.shop.platform.product.mapper.CategoryAttr;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 类目属性定义出参：字段镜像 CategoryAttr 实体现状，只减不增 */
public record CategoryAttrResponse(
        UUID id,
        UUID categoryId,
        String name,
        Integer kind,
        Boolean required,
        Boolean allowCustom,
        Integer sort,
        Integer status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public static CategoryAttrResponse from(CategoryAttr a) {
        return new CategoryAttrResponse(
                a.getId(),
                a.getCategoryId(),
                a.getName(),
                a.getKind(),
                a.getRequired(),
                a.getAllowCustom(),
                a.getSort(),
                a.getStatus(),
                a.getCreatedAt(),
                a.getUpdatedAt());
    }
}
