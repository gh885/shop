/**
 * Product 模块对外命名接口：跨模块只读查询（{@code ProductReadQuery}）与库存命令（{@code StockCommand}）。
 * SKU/SPU 状态魔法值私有在本模块，消费方一律走 {@code onSale()} / {@code published()} 谓词。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.product.api;
