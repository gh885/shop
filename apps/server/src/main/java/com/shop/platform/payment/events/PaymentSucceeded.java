package com.shop.platform.payment.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 支付成功事实。**由 payment 发，我们只认这一个事实。**
 *
 * <p>买家在支付成功页点"我已支付"不算数——那只是一个按钮。钱到没到，只有渠道回调说了算。
 *
 * @param matched 渠道报的金额与订单应付是否一致。false 时这笔钱确实到了，但到得不对：
 *     {@code clearing} 整组进 suspense，{@code trade} 拒收不发货
 */
public record PaymentSucceeded(
        UUID eventId,
        UUID paymentId,
        UUID orderGroupId,
        long amount,
        long expectedAmount,
        boolean matched,
        String channel,
        String channelTxnId,
        Instant paidAt)
        implements DomainEvent {}
