package com.shop.platform.catalog.service;

import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.model.Listing;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.seller.events.ShopClosed;
import java.util.Objects;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 商家关店 → 这家店所有在线 listing 下架。
 *
 * <p>与 {@link MerchantSuspensionListener}（治理暂停，可恢复）是两条链：关店是商家自己的终态决定，
 * 走 {@code ShopClosed}；两者最终都落到 {@link CatalogPublishService#offlineOffer} 同一条
 * 单品下架链路（状态迁移、审计、{@code ListingOffline} 事件），不另写批量 UPDATE。
 */
@Component
public class ShopClosedListener {

    private final ListingMapper listings;
    private final CatalogPublishService publish;
    private final EventInbox inbox;

    public ShopClosedListener(ListingMapper listings, CatalogPublishService publish, EventInbox inbox) {
        this.listings = Objects.requireNonNull(listings, "listings");
        this.publish = Objects.requireNonNull(publish, "publish");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    @ApplicationModuleListener
    public void on(ShopClosed event) {
        if (!inbox.claim("catalog.shop-closed", event.eventId())) {
            return;
        }
        for (Listing listing : listings.findOnlineByShop(event.shopId())) {
            publish.offlineOffer(listing.id(), event.actorId(), "店铺已关闭", false);
        }
    }
}
