package com.shop.platform.cart.service;

import com.shop.platform.cart.events.CartCheckedOutEvent;
import com.shop.platform.cart.mapper.CartItemMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 购物车结算清理监听：订单创建事务内同步删除被购买的条目——订单在，条目必不在。
 * 立即购买（itemIds 为空）直接跳过；userId 圈定归属，防误删他人条目。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CartEventListener {

    private final CartItemMapper cartItemMapper;

    @EventListener
    public void onCartCheckedOut(CartCheckedOutEvent event) {
        if (event.cartItemIds().isEmpty()) {
            return;
        }
        int deleted = cartItemMapper.deleteByUserAndIds(event.userId(), event.cartItemIds());
        log.debug(
                "[CART] 结算清理购物车条目, userId={}, deleted={}/{}",
                event.userId(),
                deleted,
                event.cartItemIds().size());
    }
}
