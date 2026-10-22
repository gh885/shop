package com.shop.platform.payment.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 退款成功事实。{@code trade} 与 {@code clearing} 都消费它。
 *
 * <p>必须带 {@code sellerOrderId}：部分退款时，不带它 {@code trade} 没法和 {@code RefundRequested} 对齐，
 * 只能按订单组整组冲，那就退多了。
 */
public record RefundSucceeded(
        UUID eventId,
        UUID refundId,
        UUID paymentId,
        UUID orderGroupId,
        UUID sellerOrderId,
        long amount,
        String currency,
        Instant refundedAt)
        implements DomainEvent {}
