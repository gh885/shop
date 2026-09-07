/**
 * Address 模块跨模块事件。显式开放为命名接口：address 自身发布默认切换/停用/变更通知，
 * 订单/履约/售后按需监听做影响面刷新。纯通知类；地址快照查询走 api 包同步调用。
 */
@org.springframework.modulith.NamedInterface("events")
package com.shop.platform.address.events;
