package com.shop.platform.shop.service;

import com.shop.platform.shop.events.ShopReviewDecidedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * 审核决定监听：admin 审批提交后把店铺状态对齐（事件类在 shop 模块，同模块监听用 @TransactionalEventListener 走 AFTER_COMMIT）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ShopReviewDecidedListener {

    private final ShopMapper shopMapper;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onDecided(ShopReviewDecidedEvent event) {
        Shop shop = shopMapper.selectById(event.shopId());
        if (shop == null) {
            log.warn("[SHOP] 审核决定落库失败：店铺不存在, shopId={}", event.shopId());
            return;
        }
        // 状态对齐：通过 → ACTIVE，拒绝 → REJECTED
        shop.setStatus(event.approved() ? Shop.STATUS_ACTIVE : Shop.STATUS_REJECTED);
        shopMapper.updateById(shop);
        log.info("[SHOP] 店铺状态更新, shopId={}, status={}", event.shopId(), shop.getStatus());
    }
}
