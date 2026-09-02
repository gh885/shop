package com.shop.platform.product.controller;

import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.model.AttrValueSource;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 类目属性值出参：字段镜像 CategoryAttrValue 实体现状，只减不增 */
public record CategoryAttrValueResponse(
        UUID id, UUID attrId, String value, Integer sort, AttrValueSource source, OffsetDateTime createdAt) {

    public static CategoryAttrValueResponse from(CategoryAttrValue v) {
        return new CategoryAttrValueResponse(
                v.getId(), v.getAttrId(), v.getValue(), v.getSort(), v.getSource(), v.getCreatedAt());
    }
}
