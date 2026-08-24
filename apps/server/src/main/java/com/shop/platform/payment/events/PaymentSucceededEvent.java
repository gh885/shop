package com.shop.platform.payment.events;

import java.util.UUID;

/**
 * 支付成功事件：写流水事务内发布，order 模块同步监听把订单推到 PAID；
 * 订单侧推进失败（已取消/已支付）抛异常令流水一并回滚——资金状态两侧原子。
 */
public record PaymentSucceededEvent(UUID paymentId, UUID orderId) {}
