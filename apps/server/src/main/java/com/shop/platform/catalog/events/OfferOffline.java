package com.shop.platform.catalog.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.UUID;

/**
 * 商品下架事实。搜索、推荐、购物车、比价聚合都消费它，不回查 catalog。
 *
 * <p><b>和 {@link OfferPublished} 成对，缺一个另一边就是错的。</b> 只发上架不发下架，
 * 搜索索引里会永远留着这条商品——买家点进去是 404，而运营在后台看到的是"已下架"。
 * 这是文档 §5 失败模式里「商品下架了但搜索还搜得到」那条，防法就是这一条事件真的会被发出来。
 *
 * <p>不带原因：下架原因（违规、商家主动、类目关闭）是给运营看的，
 * 消费方只需要知道"这条现在不能卖了"。真要带原因，那是另一个事件，不是在这里加字段。
 */
public record OfferOffline(UUID eventId, UUID offerId, UUID merchantId, UUID spuId, UUID shopId, Instant offlineAt)
        implements DomainEvent {}
