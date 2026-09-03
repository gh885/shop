/**
 * Product 模块 — 商品、类目、SKU
 *
 * <p>schema: product。库存归 inventory 模块（V19 起 product.skus 不持有库存列），
 * 卖家更新 SKU 时经 inventory :: StockCommand.setTotal 同步同事务调整库存量。
 */
@ApplicationModule(
        displayName = "Product",
        allowedDependencies = {"inventory :: api", "order :: api"})
package com.shop.platform.product;

import org.springframework.modulith.ApplicationModule;
