package com.shop.platform.product.service;

import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.Sku;
import java.util.List;

/** 商品详情出参：SPU 全字段 + 全部 SKU（管理端任何状态可查） */
public record ProductDetail(Product product, List<Sku> skus) {}
