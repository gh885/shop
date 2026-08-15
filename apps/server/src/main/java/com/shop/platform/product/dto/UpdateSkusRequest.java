package com.shop.platform.product.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/** 批量更新 SKU 价格/库存，请求体是更新项列表 */
public record UpdateSkusRequest(@NotEmpty List<@Valid SkuUpdateItem> items) {}
