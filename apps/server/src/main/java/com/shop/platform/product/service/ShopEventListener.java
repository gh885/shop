package com.shop.platform.product.service;

import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.shop.events.ShopTradingSuspendedEvent;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 店铺停营业 → 该店在架商品级联下架：监听 shop 的 ShopTradingSuspendedEvent（审核驳回 / 将来可能的平台禁用），
 * 在店铺状态推进的同一事务内把该店全部「上架」商品置「仓库中」——店都不能营业了，架上留着只让买家点得进买不下。
 *
 * <p>一条条件 UPDATE 批量下架，不逐个走 {@link ProductService#off}（那条路径带 X-Shop-Id 归属校验与读-改-写，
 * 卖家语境专用）。目标态与卖家手动下架一致，因此同样不外泄事件（product 没有 events 包，下架不通知别模块）。
 *
 * <p>反向不自动回上架：店铺恢复 ACTIVE 不发布事件，也不在这里补任何逻辑——恢复营业 ≠ 平台背书这批历史商品
 * 仍满足上架门槛（有货、SKU 全设价），要卖家自己在后台重新上架，重上时复检走 {@link ProductService#on}。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class ShopEventListener {

    private final ProductMapper productMapper;

    @EventListener
    public void onShopTradingSuspended(ShopTradingSuspendedEvent event) {
        int takenDown = productMapper.takedownPublished(event.shopId(), OffsetDateTime.now());
        log.info("[PRODUCT] 店铺停止营业级联下架, shopId={}, reason={}, 下架行数={}", event.shopId(), event.reason(), takenDown);
    }
}
