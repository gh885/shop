/**
 * AfterSale 模块跨模块事件。显式开放为命名接口：AfterSaleRefundedEvent 由 payment 同步监听落退款单据
 * （同事务，落不成一起回滚）。纯通知类事件；库存回补、订单投影写回等命令语义走 api 包同步调用，不走事件。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.aftersale.events;
