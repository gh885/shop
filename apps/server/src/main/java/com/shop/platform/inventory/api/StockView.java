package com.shop.platform.inventory.api;

import java.util.UUID;

/**
 * 库存只读视图：inventory.sku_stock 的跨模块投影。
 * 含可用/总/冻结三量 —— 消费方（购物车/结算/详情）据此判定缺货与展示，字段即其所需的全部。
 */
public record StockView(UUID skuId, int stock, int frozenStock, int availableStock) {}
