package com.shop.platform.product.service;

import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import java.util.List;

/**
 * 类目属性模板节点：属性定义 + 值域列表，发布页/管理端模板展示的组装形状。
 *
 * <p>本 record 内嵌 mapper 实体（CategoryAttr / CategoryAttrValue），按 AGENTS.md 不得越过 HTTP 边界——
 * 由 {@code CategoryAttrNodeResponse} 转成 CategoryAttrView/CategoryAttrValueView 后再出参，
 * 与 ProductDetail 走 ProductDetailView 同理。
 */
public record CategoryAttrNode(CategoryAttr attr, List<CategoryAttrValue> values) {}
