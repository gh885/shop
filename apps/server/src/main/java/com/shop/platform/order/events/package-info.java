/**
 * Order 模块跨模块事件。显式开放为命名接口：product（库存增减）、cart（结算清理）经事件总线消费；
 * 除此之外 order 模块内部类型不对其他模块可见。事件为同步监听契约：监听方抛异常会回滚发布方事务。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.order.events;
