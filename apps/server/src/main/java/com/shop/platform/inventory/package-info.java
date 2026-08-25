/**
 * Inventory 模块 — 库存主体与流水。
 *
 * <p>schema: inventory。库存唯一真相源迁入本模块（V19 起 product.skus 不持有库存列）。
 * 冻结模型：stock=总库存、frozen_stock=冻结量、可用量=stock-frozen_stock；
 * 下单冻结、支付扣实、取消/关单释放、后台补货/绝对量调整全部经 product/order/payment
 * 经 {@code inventory :: api} 的 StockCommand 同步同事务调用，每笔变更同步写流水账本。
 * 本模块不写任何他方 schema，不依赖任何业务模块（SKU 号裸引用）。
 */
@ApplicationModule(displayName = "Inventory")
package com.shop.platform.inventory;

import org.springframework.modulith.ApplicationModule;
