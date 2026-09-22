package com.shop.platform.cart.service;

import com.shop.platform.account.events.UserDeletedEvent;
import com.shop.platform.cart.mapper.CartItemMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 账号注销 → 清空该用户名下的购物车条目：监听 account 的 UserDeletedEvent，在注销生效的同一事务内落地。
 *
 * <p>为什么是本模块监听、而不是 account 直接来删：account 谁都不依赖，反向调 cart 的 api 会与
 * 既有的「cart → account 无、order → account 有」那条链凑成环（详见 {@code account/events} 包注释）。
 * 顺带的好处是清理规则长在使用这张表的模块里，改购物车语义时只需要看这一处。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class CartAccountDeletionListener {

    private final CartItemMapper cartItemMapper;

    @EventListener
    public void onUserDeleted(UserDeletedEvent event) {
        // 全部条目一次删除，不做「已勾选/未勾选」区分——人已经不在了，意愿数据没有下一站
        int removed = cartItemMapper.deleteByUser(event.userId());
        if (removed > 0) {
            log.info("[CART] 账号注销清理购物车, userId={}, 删除行数={}", event.userId(), removed);
        }
    }
}
