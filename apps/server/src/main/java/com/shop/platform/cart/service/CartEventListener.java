package com.shop.platform.cart.service;

import com.shop.platform.cart.mapper.CartItemMapper;
import com.shop.platform.order.events.OrderPlacedEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 下单清购物车：监听 order 的 OrderPlacedEvent，在下单事务内同步删除本人车里被买下的 SKU 条目——订单在，条目必不在。
 * 按 userId + skuId 圈定（不依赖购物车条目 id，order 无需认识购物车）；userId 圈定归属，防误删他人条目。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CartEventListener {

    private final CartItemMapper cartItemMapper;

    @EventListener
    public void onOrderPlaced(OrderPlacedEvent event) {
        if (event.skuIds().isEmpty()) {
            return;
        }
        int deleted = cartItemMapper.deleteByUserAndSkuIds(event.userId(), event.skuIds());
        log.debug(
                "[CART] 下单清理购物车条目, userId={}, deleted={}/{}",
                event.userId(),
                deleted,
                event.skuIds().size());
    }
}
