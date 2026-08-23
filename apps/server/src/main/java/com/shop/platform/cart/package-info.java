/**
 * Cart 模块 — 登录态购物车（交易前置域）
 *
 * <p>schema: cart。不做游客购物车与合并；条目只存 user_id + sku_id + 数量/勾选，
 * 展示数据（现价/库存/标题/店铺）读取时对 product / shop schema 按 ID 只读批查拼装，
 * 禁止 JOIN。价格快照是 order 模块的职责，cart 不预支。
 */
@ApplicationModule(displayName = "Cart")
package com.shop.platform.cart;

import org.springframework.modulith.ApplicationModule;
