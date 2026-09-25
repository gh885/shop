package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.model.CategoryStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 类目出参：字段镜像实体现状；树形展示走 service 的 CategoryNode（含 children），此处为单节点 CRUD 回显 */
@Schema(name = "CategoryResponse")
public record CategoryView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID parentId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) Integer level,
        @Schema(requiredMode = REQUIRED) Integer sort,
        @Schema(requiredMode = REQUIRED) CategoryStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String iconUrl,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static CategoryView from(Category c) {
        return new CategoryView(
                c.getId(),
                c.getParentId(),
                c.getName(),
                c.getLevel(),
                c.getSort(),
                c.getStatus(),
                c.getIconUrl(),
                c.getCreatedAt(),
                c.getUpdatedAt());
    }
}
