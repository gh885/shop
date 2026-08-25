/**
 * Order 模块对外命名接口：跨模块只读查询（{@code OrderReadQuery}，payment 支付前置校验）
 * 与订单命令（{@code OrderCommand}，payment 推进状态机）。订单状态魔法值私有在本模块。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.order.api;
