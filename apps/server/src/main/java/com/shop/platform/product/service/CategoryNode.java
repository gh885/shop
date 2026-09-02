package com.shop.platform.product.service;

import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.model.CategoryStatus;
import java.util.List;
import java.util.UUID;
import lombok.Builder;

@Builder
public record CategoryNode(
        UUID id,
        UUID parentId,
        String name,
        Integer level,
        Integer sort,
        CategoryStatus status,
        String iconUrl,
        List<CategoryNode> children) {

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
