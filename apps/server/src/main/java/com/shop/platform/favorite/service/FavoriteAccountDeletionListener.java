package com.shop.platform.favorite.service;

import com.shop.platform.account.events.UserDeletedEvent;
import com.shop.platform.favorite.mapper.FavoriteItemMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 账号注销 → 清空该用户名下的收藏：监听 account 的 UserDeletedEvent，在注销生效的同一事务内落地。
 *
 * <p>收藏与购物车同档：都是「我喜欢/我想要」的意愿数据，注销后既无人消费，也构成一份可关联到
 * 具体某人的兴趣画像——正是删除权要带走的那类信息。依赖方向的说明见 {@code account/events} 包注释。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class FavoriteAccountDeletionListener {

    private final FavoriteItemMapper favoriteItemMapper;

    @EventListener
    public void onUserDeleted(UserDeletedEvent event) {
        int removed = favoriteItemMapper.deleteByUser(event.userId());
        if (removed > 0) {
            log.info("[FAVORITE] 账号注销清理收藏, userId={}, 删除行数={}", event.userId(), removed);
        }
    }
}
