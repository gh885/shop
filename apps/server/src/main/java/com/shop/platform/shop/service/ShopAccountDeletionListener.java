package com.shop.platform.shop.service;

import com.shop.platform.account.events.UserDeletedEvent;
import com.shop.platform.shop.events.ShopTradingSuspendedEvent;
import com.shop.platform.shop.mapper.ShopMapper;
import com.shop.platform.shop.mapper.ShopMemberMapper;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 账号注销 → 断开本人与店铺的两类关系：监听 account 的 UserDeletedEvent，在注销生效的同一事务内落地。
 *
 * <p>子账号/待确认邀请：删行。人已经不在，而 ACTIVE 成员离开本店只有「店主移除」一条通道（ACC-13），
 * 不给注销连带清理就等于留一扇打不开的门。
 *
 * <p>店主身份：先把该店推成 DISABLED，再按 ACC-72 的立约在同一事务播报
 * {@link ShopTradingSuspendedEvent}（product 据此级联下架在架商品）。
 * <b>店不删、不改店主、不释放店名</b>——「这家店曾属于谁」与审核历史是平台治理的凭据，已售出的单还要有人对货；
 * 平台侧的封店/注销店铺端点仍属空缺（ACC-60），这里只是「店主这个人消失了」这一事实的既有出口。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ShopAccountDeletionListener {

    /** 停营业原因的口径串（给人看的日志/审计用，消费方不按它分支，见 ShopTradingSuspendedEvent） */
    private static final String REASON_OWNER_DELETED = "OWNER_DELETED";

    private final ShopMemberMapper shopMemberMapper;
    private final ShopMapper shopMapper;
    private final ApplicationEventPublisher events;

    @EventListener
    public void onUserDeleted(UserDeletedEvent event) {
        UUID userId = event.userId();
        // 先取店再删行：删完就不知道该停哪几家店了（OWNER 行是店主身份的唯一真相，ACC-01）
        List<UUID> owned = shopMemberMapper.selectOwnedShopIds(userId);
        int members = shopMemberMapper.deleteByUser(userId);
        int suspended = owned.stream().mapToInt(this::suspendIfTrading).sum();
        if (members > 0 || suspended > 0) {
            log.info("[SHOP] 账号注销清理店铺关系, userId={}, 成员行数={}, 停营业店数={}", userId, members, suspended);
        }
    }

    /** 停一家店：条件更新（只动 ACTIVE）拿到的才是自己真正推进的那家，0 行不发事件 */
    private int suspendIfTrading(UUID shopId) {
        if (shopMapper.suspend(shopId) == 0) {
            return 0;
        }
        events.publishEvent(new ShopTradingSuspendedEvent(shopId, REASON_OWNER_DELETED));
        return 1;
    }
}
