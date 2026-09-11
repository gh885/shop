package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.model.CategoryStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;
import lombok.Builder;

/**
 * 类目树节点：含 children 递归。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
@Builder
public record CategoryNode(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID parentId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) Integer level,
        @Schema(requiredMode = REQUIRED) Integer sort,
        @Schema(requiredMode = REQUIRED) CategoryStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String iconUrl,
        @Schema(requiredMode = REQUIRED) List<CategoryNode> children) {

    /** 从类目实体组装节点，children 由调用方递归传入。转换规则收在此处，防散落 */
    public static CategoryNode from(Category c, List<CategoryNode> children) {
        return CategoryNode.builder()
                .id(c.getId())
                .parentId(c.getParentId())
                .name(c.getName())
                .level(c.getLevel())
                .sort(c.getSort())
                .status(c.getStatus())
                .iconUrl(c.getIconUrl())
                .children(children)
                .build();
    }
}
