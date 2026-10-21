package com.shop.platform.catalog.dto;

import java.util.UUID;

/** 建商品草稿的返回：只需要回 SPU id，后续 SKU/offer 都按它挂。 */
public record CreateProductResponse(UUID spuId) {}
