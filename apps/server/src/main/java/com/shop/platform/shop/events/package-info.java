/**
 * Shop 模块跨模块事件。显式开放为命名接口，消费方均同步监听（同事务，落不成一起回滚）：
 * <ul>
 *   <li>ShopTradingSuspendedEvent —— 店铺进入不可营业态（审核驳回 / 平台禁用）；product 据此把该店在架商品级联下架。
 * </ul>
 * 纯通知类事件：只播报「这家店不营业了」，不带状态词表（{@code ShopStatus} 不外泄），消费方不得按 reason 分支。
 * 反向没有事件：恢复 ACTIVE 不发布事件，被下架的商品由卖家手动重新上架（恢复 ≠ 背书历史商品质量）。
 * 券（coupon）一期不参与级联——店家的券不随店铺停营业作废，留作后续决策。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.shop.events;
