package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.order.events.OrderCancelledEvent;
import com.shop.platform.order.events.OrderCreatedEvent;
import com.shop.platform.order.events.OrderLine;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 库存事件监听：订单创建扣减、订单取消回补。
 *
 * <p>同步同事务消费（不用 AFTER_COMMIT）：扣减发生在下单事务内，任一 SKU 条件扣减失败
 * （WHERE stock >= n 影响行数 = 0）抛 409 令整单回滚——防超卖的最终闸门与下单原子；
 * 回补同理与取消原子。数量来自本模块校验过的快照行，SQL 参数化拼接无注入面。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StockEventListener {

    private final SkuMapper skuMapper;

    @EventListener
    public void onOrderCreated(OrderCreatedEvent event) {
        for (OrderLine line : event.lines()) {
            // 1. 条件扣减：库存不足时影响行数为 0，拒绝整笔订单
            int affected = skuMapper.update(
                    null,
                    new LambdaUpdateWrapper<Sku>()
                            .setSql("stock = stock - {0}", line.quantity())
                            .eq(Sku::getId, line.skuId())
                            .ge(Sku::getStock, line.quantity()));
            if (affected == 0) {
                String name = skuName(line.skuId());
                log.warn("[PRODUCT] 库存不足拒绝下单, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("INSUFFICIENT_STOCK", "「" + name + "」库存不足，请调整数量");
            }
        }
    }

    @EventListener
    public void onOrderCancelled(OrderCancelledEvent event) {
        for (OrderLine line : event.lines()) {
            // 取消回补：无条件加回（订单既然成立过，库存就欠它）
            skuMapper.update(
                    null,
                    new LambdaUpdateWrapper<Sku>()
                            .setSql("stock = stock + {0}", line.quantity())
                            .eq(Sku::getId, line.skuId()));
        }
    }

    /** 失败提示带 SKU 名：只在本模块内查自己的表，无跨模块问题 */
    private String skuName(UUID skuId) {
        Sku sku = skuMapper.selectById(skuId);
        return sku != null && sku.getName() != null ? sku.getName() : "商品";
    }
}
