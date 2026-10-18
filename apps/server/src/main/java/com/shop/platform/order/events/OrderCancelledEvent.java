package com.shop.platform.order.events;

import java.util.UUID;

/**
 * 已付款订单取消事件：<b>只在需要退款时</b>发布（买家取消已付款单——已付款单只有这一个来源，
 * 系统不代取消，见 ORD-60），aftersale 模块同步监听、同事务建整单退款单并执行，保证「已付款订单取消了必定留下退款单据」。
 * 未付款单取消（待付款超时、买家取消待付款单）不发本事件——发出来也只是消费方直接 return 的空转通知，
 * 故不带 wasPaid 之类的标志位。
 *
 * <p><b>为何事件类型归生产方（order）所有，与 cart :: events 的惯例相反</b>：那条惯例（事件放消费方）
 * 的目的是避免模块环 —— cart 场景里 order 已依赖 cart :: api，事件放 order 侧才会成环。
 * 这里方向恰好相反：payment 已依赖 order :: api（OrderReadQuery / OrderCommand），
 * 事件若放 payment 侧会形成 order ↔ payment 环，放 order 侧才满足同一目的。
 */
public record OrderCancelledEvent(UUID orderId, UUID userId) {}
