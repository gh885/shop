package com.shop.platform.inventory.api;

import java.util.UUID;

/** 库存结算的最小投影：SKU + 数量。冻结/扣实/释放共用，字段即库存变更所需的全部。 */
public record StockLine(UUID skuId, int quantity) {}
