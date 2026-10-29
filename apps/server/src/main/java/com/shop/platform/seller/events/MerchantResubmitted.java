package com.shop.platform.seller.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 商家对被拒的入驻重新提交审核。
 *
 * <p>seller → governance 的请求只能走事件（支撑域不反向调核心域的 api）。
 * governance 消费后做 {@code rejected → applied} 的 CAS；重投或状态已推进时 0 行，幂等忽略。
 */
public record MerchantResubmitted(UUID eventId, UUID merchantId, Instant occurredAt) implements DomainEvent {

    public MerchantResubmitted {
        java.util.Objects.requireNonNull(eventId, "eventId");
        java.util.Objects.requireNonNull(merchantId, "merchantId");
        java.util.Objects.requireNonNull(occurredAt, "occurredAt");
    }
}
