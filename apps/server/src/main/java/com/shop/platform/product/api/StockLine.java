package com.shop.platform.product.api;

import java.util.UUID;

/** 库存结算的最小投影：SKU + 数量。扣减/回补共用，字段即库存变更所需的全部。 */
public record StockLine(UUID skuId, int quantity) {}
