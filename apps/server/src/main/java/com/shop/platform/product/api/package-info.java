/**
 * Product 模块对外命名接口：跨模块只读查询（{@code ProductReadQuery} 按主键点查投影、
 * {@code ProductRecallQuery} 种子序 keyset 扫一页商品卡）与命令（{@code ProductCommand.addSold}，
 * order 完成订单时同事务累加销量投影列）。
 *
 * <p>{@code ProductRecallQuery} 是本包唯一的「非按 ID 查询」：种子序排序键跑在 {@code product.products} 上，
 * 跨 schema 没有第二个地方能执行它（见 apps/server/AGENTS.md 模块边界规范的例外条款）。它的边界刻意收窄——
 * 不认识游标格式、不认识用户、不 JOIN、不写，类目子树展开等商品侧语义留在本模块内部。
 *
 * <p>库存不归本模块（V19 起唯一真相源在 inventory.sku_stock），消费方库存读写一律走 inventory :: api。
 * SKU/SPU 状态魔法值私有在本模块，消费方一律走 {@code onSale()} / {@code published()} 谓词。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.product.api;
