/**
 * Order 模块跨模块事件。显式开放为命名接口，消费方均同步监听（同事务，落不成一起回滚）：
 * <ul>
 *   <li>OrderPlacedEvent —— 下单成功；cart 按 userId + skuId 清理已购条目。
 *   <li>OrderCancelledEvent —— 已付款订单取消（只有买家手动取消这一来源，系统不代取消已付款单）；
 *       aftersale 建整单退款单，logistics 取消该单的待发货包裹。
 * </ul>
 * 纯通知类事件；库存增减、订单状态推进、销量累加等命令语义走 api 包同步调用，不走事件。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.order.events;
