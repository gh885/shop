package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.model.AttrKind;
import com.shop.platform.product.model.CategoryAttrStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 类目属性定义出参：字段镜像 CategoryAttr 实体现状，只减不增 */
@Schema(name = "CategoryAttrResponse")
public record CategoryAttrView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID categoryId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) AttrKind kind,
        @Schema(requiredMode = REQUIRED) Boolean required,
        @Schema(requiredMode = REQUIRED) Boolean allowCustom,
        @Schema(requiredMode = REQUIRED) Boolean allowImage,
        @Schema(requiredMode = REQUIRED) Integer sort,
        @Schema(requiredMode = REQUIRED) CategoryAttrStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static CategoryAttrView from(CategoryAttr a) {
        return new CategoryAttrView(
                a.getId(),
                a.getCategoryId(),
                a.getName(),
                a.getKind(),
                a.getRequired(),
                a.getAllowCustom(),
                a.getAllowImage(),
                a.getSort(),
                a.getStatus(),
                a.getCreatedAt(),
                a.getUpdatedAt());
    }
}
