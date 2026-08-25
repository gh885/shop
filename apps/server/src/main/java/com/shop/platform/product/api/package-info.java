/**
 * Product 模块对外命名接口：跨模块只读查询（{@code ProductReadQuery}，SKU/SPU 投影）。
 * 库存不归本模块（V19 起唯一真相源在 inventory.sku_stock），消费方库存读写一律走 inventory :: api。
 * SKU/SPU 状态魔法值私有在本模块，消费方一律走 {@code onSale()} / {@code published()} 谓词。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.product.api;
