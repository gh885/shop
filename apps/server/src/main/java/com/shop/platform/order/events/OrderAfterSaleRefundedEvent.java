package com.shop.platform.order.events;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 售后退款事件：卖家同意售后（售后线 APPLYING → REFUNDED）后在订单事务内发布一次，
 * payment 模块同步监听把该单的成功支付流水转 REFUNDED —— 落不成则连订单侧一起回滚，
 * 不会出现「订单显示已退款却查无退款流水」。V1 仅退款情景，无库存回补。
 *
 * <p>事件归属生产方（order :: events）：payment 已依赖 order :: api，事件放 payment 侧会成环。
 */
public record OrderAfterSaleRefundedEvent(UUID orderId, UUID userId, Money refundAmount) {}
