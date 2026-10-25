package com.shop.platform.trade.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 订单组落单事实，按组发——与 {@link SellerOrderPlaced}（按商家子单发）互补。
 *
 * <p>子单事件带着金额与商家维度给结算和履约用；这个事件只回答「这个买家刚把哪些 SKU 买走了」：
 * 购物车在下单时清掉被买下的条目，订单在、条目必不在。SKU 去重后的全集，数量不给——
 * 清车只认「买没买」，不认「买了几件」。
 */
public record OrderGroupPlaced(UUID eventId, UUID orderGroupId, UUID buyerId, List<UUID> skuIds, Instant placedAt)
        implements DomainEvent {

    public OrderGroupPlaced {
        skuIds = List.copyOf(skuIds);
    }
}
