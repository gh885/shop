package com.shop.platform.governance.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/** 平台恢复商家经营。不自动把商品重新上架——恢复营业 ≠ 平台背书历史商品仍满足上架门槛。 */
public record SellerResumed(UUID eventId, UUID merchantId, String reason, UUID actorId, Instant occurredAt)
        implements DomainEvent {

    public SellerResumed {
        java.util.Objects.requireNonNull(eventId, "eventId");
        java.util.Objects.requireNonNull(merchantId, "merchantId");
        java.util.Objects.requireNonNull(occurredAt, "occurredAt");
    }
}
