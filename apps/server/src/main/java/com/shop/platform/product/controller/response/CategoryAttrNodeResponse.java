package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.service.CategoryAttrNode;
import com.shop.platform.product.service.CategoryAttrValueView;
import com.shop.platform.product.service.CategoryAttrView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/**
 * 类目属性模板节点出参：属性定义 + 值域列表，镜像 service 的 CategoryAttrNode。
 *
 * <p>CategoryAttrAdminController（管理端）与 CategoryController（卖家发布页/买家详情）共用 → 按规范提升为包内顶层类。
 */
public record CategoryAttrNodeResponse(
        @Schema(requiredMode = REQUIRED) CategoryAttrView attr,
        @Schema(requiredMode = REQUIRED) List<CategoryAttrValueView> values) {

    public static CategoryAttrNodeResponse from(CategoryAttrNode node) {
        return new CategoryAttrNodeResponse(
                CategoryAttrView.from(node.attr()),
                node.values().stream().map(CategoryAttrValueView::from).toList());
    }
}
