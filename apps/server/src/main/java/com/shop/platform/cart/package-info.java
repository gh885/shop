/**
 * Cart 模块 — 登录态购物车（交易前置域）
 *
 * <p>schema: cart。不做游客购物车与合并；条目只存 user_id + sku_id + 数量/勾选，
 * 展示数据（现价/库存/标题/店铺）读取时经 product / shop 的 api 包按 ID 只读批查拼装，
 * 禁止 JOIN。加购除「SKU 在售 + SPU 上架」外还过 shop :: api 的 ShopReadQuery.isActive 营业闸门
 * （店非 ACTIVE 一律 409「店铺已停止营业」，与下单同一口径）。
 * 下单后的清理由 order :: events 的 OrderPlacedEvent 驱动：本模块同步监听，按 userId + skuId 删已购条目；
 * order 不认识购物车（无 cart :: api），结算入参由前端归约成 SKU 行。
 * 价格快照是 order 模块的职责，cart 不预支。
 */
@ApplicationModule(
        displayName = "Cart",
        allowedDependencies = {"product :: api", "inventory :: api", "shop :: api", "order :: events"})
package com.shop.platform.cart;

import org.springframework.modulith.ApplicationModule;
