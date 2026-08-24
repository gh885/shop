package com.shop.platform.product.controller;

import com.shop.platform.product.service.CategoryNode;
import java.util.List;
import java.util.UUID;

/**
 * 类目树节点出参：镜像 service 的 CategoryNode（含 children 递归），字段只减不增。
 *
 * <p>CategoryController（前台）与 CategoryAdminController（管理端）共用 → 按规范提升为包内顶层类。
 */
public record CategoryNodeResponse(
        UUID id,
        UUID parentId,
        String name,
        Integer level,
        Integer sort,
        Integer status,
        String iconUrl,
        List<CategoryNodeResponse> children) {

    public static CategoryNodeResponse from(CategoryNode node) {
        return new CategoryNodeResponse(
                node.id(),
                node.parentId(),
                node.name(),
                node.level(),
                node.sort(),
                node.status(),
                node.iconUrl(),
                node.children() == null
                        ? null
                        : node.children().stream()
                                .map(CategoryNodeResponse::from)
                                .toList());
    }
}
