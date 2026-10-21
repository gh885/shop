package com.shop.platform.trade.events;

import com.shop.platform.common.event.DomainEvent;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 下单事实。**最关键的一个事件**：它把下单瞬间的金额构成、优惠分摊、费率版本一次钉死，
 * 下游（clearing、fulfillment）只认快照，不回查。
 *
 * <p>按商家子单发，不是按订单组发：结算、发货、售后判责的单位都是子单。
 */
public record SellerOrderPlaced(
        UUID eventId,
        UUID orderGroupId,
        UUID sellerOrderId,
        UUID merchantId,
        List<Line> lines,
        long goodsAmount,
        long shippingAmount,
        long discountAmount,
        Instant placedAt)
        implements DomainEvent {

    /** 行快照，金额一律整数分。 */
    public record Line(int lineNo, UUID skuId, int quantity, long subtotal, long discountAmount, long payable) {}
}
