/**
 * Order 模块跨模块事件。显式开放为命名接口：order 取消订单成功后发布 OrderCancelledEvent，
 * payment 同步监听把成功支付流水转 REFUNDED。纯通知类事件；库存增减、订单状态推进等命令语义
 * 走 api 包同步调用，不走事件。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.order.events;
