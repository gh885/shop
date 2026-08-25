package com.shop.platform.shop.service;

import com.shop.platform.shop.events.ShopReviewDecidedEvent;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 审核决定监听：admin 审批提交后把店铺状态对齐（事件类在 shop 模块）。
 *
 * <p>刻意用事务内同步监听（@EventListener）：审批留痕与店铺状态变更是一个逻辑单元，
 * 同事务原子生效——对齐失败令整个审批回滚，员工刷新重试；绝不出现「审核记录已通过、
 * 店铺永远卡在待审」的静默分叉。尽力而为语义（AFTER_COMMIT + 失败不重试）只允许用于
 * 可人工兑底的通知场景（如开店入队审核，见 admin 侧 onShopCreated）。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ShopReviewDecidedListener {

    private final ShopMapper shopMapper;

    @EventListener
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
