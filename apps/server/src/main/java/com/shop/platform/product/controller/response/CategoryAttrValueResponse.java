package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.mapper.CategoryAttrValue;
import com.shop.platform.product.model.AttrValueSource;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 类目属性值出参：字段镜像 CategoryAttrValue 实体现状，只减不增 */
public record CategoryAttrValueResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID attrId,
        @Schema(requiredMode = REQUIRED) String value,
        @Schema(requiredMode = REQUIRED) Integer sort,
        @Schema(requiredMode = REQUIRED) AttrValueSource source,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static CategoryAttrValueResponse from(CategoryAttrValue v) {
        return new CategoryAttrValueResponse(
                v.getId(), v.getAttrId(), v.getValue(), v.getSort(), v.getSource(), v.getImage(), v.getCreatedAt());
    }
}
