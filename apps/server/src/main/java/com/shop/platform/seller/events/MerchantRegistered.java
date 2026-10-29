package com.shop.platform.seller.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 商家注册完成：身份（merchant + 主账号）与默认店铺已即时成立。
 *
 * <p>governance 消费它落 {@code seller_profile(applied)}，入驻审核从这里进队列。
 * 注册成功不等于能卖——售卖资格只在治理侧。
 */
public record MerchantRegistered(UUID eventId, UUID merchantId, String merchantName, UUID shopId, Instant occurredAt)
        implements DomainEvent {

    public MerchantRegistered {
        java.util.Objects.requireNonNull(eventId, "eventId");
        java.util.Objects.requireNonNull(merchantId, "merchantId");
        java.util.Objects.requireNonNull(merchantName, "merchantName");
        java.util.Objects.requireNonNull(shopId, "shopId");
        java.util.Objects.requireNonNull(occurredAt, "occurredAt");
    }
}
