/**
 * Inventory 模块对外命名接口：跨模块只读查询（{@code StockReadQuery}）与库存命令（{@code StockCommand}）。
 * 冻结模型三量（stock/frozen/available）的换算私有在本模块，消费方只看 {@code availableBySkuIds()} 投影。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.inventory.api;
