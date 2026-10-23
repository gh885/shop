package com.shop.platform.payment.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 退款成功事实。{@code trade} 与 {@code clearing} 都消费它。
 *
 * <p>必须带 {@code sellerOrderId}：部分退款时，不带它 {@code trade} 没法和 {@code RefundRequested} 对齐，
 * 只能按订单组整组冲，那就退多了。
 *
 * @param bizRef 发起这笔退款的上游单据（现在是售后单 id）。{@code returns} 靠它把 case 推到完成，
 *     否则退款成功后没人知道该关哪张售后单
 */
public record RefundSucceeded(
        UUID eventId,
        UUID refundId,
        UUID paymentId,
        UUID orderGroupId,
        UUID sellerOrderId,
        long amount,
        String currency,
        String bizRef,
        Instant refundedAt)
        implements DomainEvent {}
