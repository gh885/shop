package com.shop.platform.product.controller;

import com.shop.platform.product.service.CategoryAttrNode;
import java.util.List;

/**
 * 类目属性模板节点出参：属性定义 + 值域列表，镜像 service 的 CategoryAttrNode。
 *
 * <p>CategoryAttrAdminController（管理端）与 CategoryController（卖家发布页/买家详情）共用 → 按规范提升为包内顶层类。
 */
public record CategoryAttrNodeResponse(CategoryAttrResponse attr, List<CategoryAttrValueResponse> values) {

    public static CategoryAttrNodeResponse from(CategoryAttrNode node) {
        return new CategoryAttrNodeResponse(
                CategoryAttrResponse.from(node.attr()),
                node.values().stream().map(CategoryAttrValueResponse::from).toList());
    }
}
