/**
 * Shop 模块跨模块事件。显式开放为命名接口：admin 模块经事件总线消费（ShopCreatedEvent / ShopReviewDecidedEvent），
 * 除此之外 shop 模块内部类型不对其他模块可见。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.shop.events;
