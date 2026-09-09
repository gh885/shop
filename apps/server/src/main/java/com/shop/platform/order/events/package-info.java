/**
 * Order 模块跨模块事件。显式开放为命名接口，消费方均同步监听（同事务，落不成一起回滚）：
 * <ul>
 *   <li>OrderPlacedEvent —— 下单成功；cart 按 userId + skuId 清理已购条目。
 *   <li>OrderCancelledEvent —— 已付款订单取消（买家手动 / 待发货超时）；payment 落退款单据。
 *   <li>OrderAfterSaleRefundedEvent —— 卖家同意售后并退款（售后线 APPLYING → REFUNDED）；payment 落退款单据。
 * </ul>
 * 纯通知类事件；库存增减、订单状态推进、销量累加等命令语义走 api 包同步调用，不走事件。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.order.events;
