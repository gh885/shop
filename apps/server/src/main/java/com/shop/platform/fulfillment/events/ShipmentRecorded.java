package com.shop.platform.fulfillment.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 包裹发出事实。按包裹发：一个子单拆两包就是两条事件。
 *
 * <p>notification 消费它提醒买家「已发货」；轨迹细节（承运商回传）是 logistics 的事，
 * 这条事件只带商家录 primary 事实——运单号在这一刻已经确定。
 *
 * <p>必须带 {@code buyerId}：收件人在 trade 的订单组上，fulfillment 不持有买家，
 * 发事件时从 {@code TradeQuery.Shippable} 一并带出，消费方不再回查。
 */
public record ShipmentRecorded(
        UUID eventId,
        UUID sellerOrderId,
        UUID orderGroupId,
        UUID merchantId,
        UUID shopId,
        UUID packageId,
        String packageNo,
        String carrierCode,
        String trackingNo,
        UUID buyerId,
        Instant shippedAt)
        implements DomainEvent {}
