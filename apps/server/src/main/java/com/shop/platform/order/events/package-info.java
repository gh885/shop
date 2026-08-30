/**
 * Order 模块跨模块事件。显式开放为命名接口，两条都由 payment 同步监听落退款单据（同事务，落不成一起回滚）：
 * <ul>
 *   <li>OrderCancelledEvent —— 已付款订单取消（买家手动 / 待发货超时）。
 *   <li>OrderAfterSaleRefundedEvent —— 卖家同意售后并退款（售后线 APPLYING → REFUNDED）。
 * </ul>
 * 纯通知类事件；库存增减、订单状态推进等命令语义走 api 包同步调用，不走事件。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.order.events;
