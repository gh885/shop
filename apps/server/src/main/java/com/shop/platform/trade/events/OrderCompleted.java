package com.shop.platform.trade.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 交易完成：全部子单都已签收。
 *
 * <p>它告诉下游两件事——{@code clearing} 可以结算了，{@code review} 可以开放评价了。
 *
 * <p><b>完成不是关闭。</b> 已完成订单还要走售后和结算，所以 {@code order_group.closed_at} 保持为空；
 * 给它一个关闭时间会让展示态变成"已取消"。
 */
public record OrderCompleted(UUID eventId, UUID orderGroupId, java.util.List<UUID> sellerOrderIds, Instant completedAt)
        implements DomainEvent {

    public OrderCompleted {
        sellerOrderIds = java.util.List.copyOf(sellerOrderIds);
    }
}
