/**
 * Product 模块 — 商品、类目、SKU
 *
 * <p>schema: product。库存归 inventory 模块（V19 起 product.skus 不持有库存列），
 * 卖家更新 SKU 时经 inventory :: StockCommand.setTotal 同步同事务调整库存量。
 *
 * <p>商品下架有两条入口，同一个目标态（仓库中）：卖家手动（ProductService.off，带 X-Shop-Id 归属校验），
 * 以及店铺停止营业的级联——本模块同步监听 shop :: events 的 ShopTradingSuspendedEvent（审核驳回/平台禁用），
 * 在店铺状态推进的同一事务内把该店在架商品批量置仓库中（ShopEventListener）。反向不自动回上架：
 * 店铺恢复 ACTIVE 不发布事件，恢复营业 ≠ 背书历史商品仍满足上架门槛，要卖家手动重上并复检。
 * 下架不外泄事件（本模块无 events 包），券也不随店铺停营业被级联（留白，见 shop :: events 的包注释）。
 */
@ApplicationModule(
        displayName = "Product",
        allowedDependencies = {"inventory :: api", "shop :: events"})
package com.shop.platform.product;

import org.springframework.modulith.ApplicationModule;
