package com.shop.platform.governance.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 平台暂停商家经营。
 *
 * <p>catalog 消费它把该商家所有在线 listing 下架；search 将来消费它清索引。
 * 事件只带「谁、为什么、谁操作的」，不带要下架多少条——那是消费方自己查的事实。
 */
public record SellerSuspended(UUID eventId, UUID merchantId, String reason, UUID actorId, Instant occurredAt)
        implements DomainEvent {

    public SellerSuspended {
        java.util.Objects.requireNonNull(eventId, "eventId");
        java.util.Objects.requireNonNull(merchantId, "merchantId");
        java.util.Objects.requireNonNull(actorId, "actorId");
        java.util.Objects.requireNonNull(occurredAt, "occurredAt");
    }
}
