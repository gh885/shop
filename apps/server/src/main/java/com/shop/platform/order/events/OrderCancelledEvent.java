package com.shop.platform.order.events;

import java.util.UUID;

/**
 * 订单取消事件：买家主动取消成功后在同一事务内发布一次。payment 模块同步监听 ——
 * {@code wasPaid} 为真时把该单的成功支付流水转 REFUNDED，保证「已付款订单取消了必定留下退款单据」。
 *
 * <p><b>为何事件类型归生产方（order）所有，与 cart :: events 的惯例相反</b>：那条惯例（事件放消费方）
 * 的目的是避免模块环 —— cart 场景里 order 已依赖 cart :: api，事件放 order 侧才会成环。
 * 这里方向恰好相反：payment 已依赖 order :: api（OrderReadQuery / OrderCommand），
 * 事件若放 payment 侧会形成 order ↔ payment 环，放 order 侧才满足同一目的。
 *
 * <p>{@code wasPaid} 由 order 侧从「取消前状态」推导后再对外暴露，不外泄订单状态魔法值
 * （状态常量私有在 owning 模块，见 order :: api 的约定）。
 *
 * <p>超时关单（OrderCloseService）不发本事件：其条件更新限定源状态为 PENDING_PAYMENT，
 * 必然未付款，发出来只会是消费方直接 return 的空转通知。
 */
public record OrderCancelledEvent(UUID orderId, UUID userId, boolean wasPaid) {}
