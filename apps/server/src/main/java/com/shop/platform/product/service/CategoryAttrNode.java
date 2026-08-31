package com.shop.platform.product.service;

import com.shop.platform.product.mapper.CategoryAttr;
import com.shop.platform.product.mapper.CategoryAttrValue;
import java.util.List;

/** 类目属性模板节点：属性定义 + 值域列表，发布页/管理端模板展示的组装形状 */
public record CategoryAttrNode(CategoryAttr attr, List<CategoryAttrValue> values) {}
