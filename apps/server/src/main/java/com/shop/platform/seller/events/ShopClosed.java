package com.shop.platform.seller.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 店铺关闭（终态）。catalog 消费它把该店所有在线 listing 下架。
 *
 * <p>与治理侧的 {@code SellerSuspended}（商家暂停，可恢复）分开：关店是商家自己的终态决定，
 * 不设重开路径——要再卖就注册新店。在途订单不拦，照常履约到完结。
 */
public record ShopClosed(UUID eventId, UUID merchantId, UUID shopId, UUID actorId, Instant occurredAt)
        implements DomainEvent {

    public ShopClosed {
        java.util.Objects.requireNonNull(eventId, "eventId");
        java.util.Objects.requireNonNull(merchantId, "merchantId");
        java.util.Objects.requireNonNull(shopId, "shopId");
        java.util.Objects.requireNonNull(actorId, "actorId");
        java.util.Objects.requireNonNull(occurredAt, "occurredAt");
    }
}
