/**
 * Payment 模块跨模块事件。显式开放为命名接口：order 模块同步消费（PaymentSucceededEvent 推进订单状态机）。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.payment.events;
