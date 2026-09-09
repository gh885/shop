package com.shop.platform.aftersale.events;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 售后退款事件：仅退款同意（APPLYING → REFUNDED）或退货收货确认（RETURNING → REFUNDED）后在售后事务内发布一次，
 * payment 模块同步监听把该单的成功支付流水转 REFUNDED —— 落不成则连售后单一起回滚，
 * 不会出现「售后显示已退款却查无退款流水」。V1 整单退款，金额 = 售后单退款口径。
 */
public record AfterSaleRefundedEvent(UUID orderId, UUID userId, Money refundAmount) {}
