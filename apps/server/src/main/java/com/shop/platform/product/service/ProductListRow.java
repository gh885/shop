package com.shop.platform.product.service;

import com.shop.platform.product.mapper.Product;

/** 卖家工作台商品列表行：SPU + 库存/销量两个纯展示指标（见 ProductQueryService.pageListWithMetrics） */
public record ProductListRow(Product product, int stock, long soldCount) {}
