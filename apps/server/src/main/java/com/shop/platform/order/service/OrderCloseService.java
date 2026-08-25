package com.shop.platform.order.service;

import static com.shop.platform.order.mapper.Order.STATUS_CANCELLED;
import static com.shop.platform.order.mapper.Order.STATUS_PENDING_PAYMENT;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.OrderItemMapper;
import com.shop.platform.order.mapper.OrderMapper;
import com.shop.platform.product.api.StockCommand;
import java.time.OffsetDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 超时关单：单笔关单 + 库存回补为一个独立事务。
 *
 * <p>批量入口在 OrderService.closeExpired（扫描 + 逐笔调用本 bean），与单笔方法分属两个 bean，
 * 规避 Spring 自调用导致 @Transactional 失效；单笔事务短，扫到大批也不拖长事务。
 */
@Service
@RequiredArgsConstructor
public class OrderCloseService {

    /** 超时关单单批上限：部分索引全集有限，分批跑防任务线程长事务 */
    static final int CLOSE_BATCH_LIMIT = 100;

    private final OrderMapper orderMapper;

    private final OrderItemMapper orderItemMapper;

    private final StockCommand stockCommand;

    /**
     * 单笔关单：系统语义只认 PENDING_PAYMENT（不走 sourcesOf——只有「待付款超时」这一系统场景，
     * 与买家取消共享目标态但源状态集合刻意不同），成功则同事务回补库存。
     *
     * @return 是否成功关单（与支付/手动取消竞态时让位返回 false）
     */
    @Transactional
    public boolean closeOne(Order order) {
        // 1. 条件更新防竞态：手动支付/取消先到先得，本任务让位
        int affected = orderMapper.update(
                null,
                new LambdaUpdateWrapper<Order>()
                        .eq(Order::getId, order.getId())
                        .eq(Order::getStatus, STATUS_PENDING_PAYMENT)
                        .set(Order::getStatus, STATUS_CANCELLED)
                        .set(Order::getCancelledAt, OffsetDateTime.now())
                        .set(Order::getCancelReason, "超时未支付，自动关闭"));
        if (affected != 1) {
            return false;
        }

        // 2. 回补库存（同事务同步调用）
        stockCommand.restock(OrderService.toStockLines(orderItemMapper.selectList(
                new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, order.getId()))));
        return true;
    }
}
