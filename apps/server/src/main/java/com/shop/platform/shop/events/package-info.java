/**
 * Shop 模块跨模块事件。显式开放为命名接口：admin 模块消费 ShopCreatedEvent（开店入队审核）、
 * 发布 ShopReviewDecidedEvent（审批决定回写店铺状态，shop 侧事务内同步监听），
 * 除此之外 shop 模块内部类型不对其他模块可见。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.shop.events;
