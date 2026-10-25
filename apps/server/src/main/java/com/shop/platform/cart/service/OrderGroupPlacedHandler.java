package com.shop.platform.cart.service;

import com.shop.platform.cart.mapper.CartItemMapper;
import com.shop.platform.infra.event.EventInbox;
import com.shop.platform.trade.events.OrderGroupPlaced;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.stereotype.Component;

/**
 * 消费 {@code OrderGroupPlaced}，下单即清掉车里被买下的条目——订单在，条目必不在。
 *
 * <p>清车时机是「落单」不是「支付」：下单成功货就已经是这单的了，等支付再清，
 * 支付失败回滚的窗口里用户会看到车被误清。与旧实现同一口径。
 *
 * <p>批量删带 buyer_id 圈定归属：事件只说明「这个买家买了这些」，别人的车里同款照留——
 * 那是别人还没买走的意图。
 *
 * <p>{@code @ApplicationModuleListener} 自带事务，不能再加 {@code @Transactional}。
 */
@Component
public class OrderGroupPlacedHandler {

    private static final Logger log = LoggerFactory.getLogger(OrderGroupPlacedHandler.class);

    private final CartItemMapper items;
    private final EventInbox inbox;

    public OrderGroupPlacedHandler(CartItemMapper items, EventInbox inbox) {
        this.items = Objects.requireNonNull(items, "items");
        this.inbox = Objects.requireNonNull(inbox, "inbox");
    }

    @ApplicationModuleListener
    public void on(OrderGroupPlaced event) {
        // 幂等闸门：事件可能被重投
        if (!inbox.claim("cart.order-group-placed", event.eventId())) {
            return;
        }
        if (event.skuIds().isEmpty()) {
            return;
        }
        int deleted = items.deleteByBuyerAndSkuIds(event.buyerId(), event.skuIds());
        log.info(
                "订单 {} 落单清车：删 {}/{} 条（buyer={}）",
                event.orderGroupId(),
                deleted,
                event.skuIds().size(),
                event.buyerId());
    }
}
