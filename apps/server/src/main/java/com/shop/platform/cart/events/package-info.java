/**
 * Cart 模块跨模块事件。显式开放为命名接口：order（下单编排）发布 CartCheckedOutEvent，
 * cart 同步监听做结算清理。纯通知类事件；库存增减等命令语义走 api 包同步调用，不走事件。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.cart.events;
