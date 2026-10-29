package com.shop.platform.catalog.service;

import com.shop.platform.catalog.mapper.ListingMapper;
import com.shop.platform.catalog.model.Listing;
import com.shop.platform.governance.events.SellerSuspended;
import com.shop.platform.infra.event.EventInbox;
import java.util.Objects;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 商家停业 → 该商家所有在线 listing 下架。
 *
 * <p>事件经 Modulith outbox 异步投递，消费方用自己的事务逐条走
 * {@link CatalogPublishService#offlineOffer}：状态迁移、审计、{@code ListingOffline} 事件
 * 与卖家手动下架完全同一条链路，不另写一套批量 UPDATE。
 */
@Component
public class MerchantSuspensionListener {

    private final ListingMapper listings;
    private final CatalogPublishService publish;
    private final EventInbox inbox;

    public MerchantSuspensionListener(ListingMapper listings, CatalogPublishService publish, EventInbox inbox) {
        this.listings = Objects.requireNonNull(listings, "listings");
        this.publish = Objects.requireNonNull(publish, "publish");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    @ApplicationModuleListener
    public void on(SellerSuspended event) {
        if (!inbox.claim("catalog.seller-suspended", event.eventId())) {
            return;
        }
        String reason =
                event.reason() == null || event.reason().isBlank() ? "商家经营被平台暂停" : "商家经营被平台暂停：" + event.reason();
        for (Listing listing : listings.findOnlineByMerchant(event.merchantId())) {
            publish.offlineOffer(listing.id(), event.actorId(), reason, false);
        }
    }
}
