package com.shop.platform.trade.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 交易完成：全部子单都已签收。
 *
 * <p>它告诉下游三件事——{@code clearing} 可以结算了，{@code review} 可以开放评价了，
 * {@code notification} 可以提醒买家来评价了。
 *
 * <p><b>完成不是关闭。</b> 已完成订单还要走售后和结算，所以 {@code order_group.closed_at} 保持为空；
 * 给它一个关闭时间会让展示态变成"已取消"。
 *
 * <p>带 {@code buyerId}：评价与通知的收件人都是买家，消费方不再为找买家回查 trade。
 */
public record OrderCompleted(
        UUID eventId, UUID orderGroupId, UUID buyerId, java.util.List<UUID> sellerOrderIds, Instant completedAt)
        implements DomainEvent {

    public OrderCompleted {
        sellerOrderIds = java.util.List.copyOf(sellerOrderIds);
    }
}
