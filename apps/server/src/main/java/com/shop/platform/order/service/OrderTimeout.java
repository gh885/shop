package com.shop.platform.order.service;

import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.function.BiPredicate;

/**
 * 子订单的超时契约 —— 只剩「已发货超时未确认」一条。
 *
 * <p>待支付超时已搬到主订单（{@link TradeTimeoutService}）：待付款是主订单的状态，扫描与关单都该在
 * trades 上，子订单没有待付款态可扫。
 *
 * <p><b>「卖家未发货」不在表里，这是拍板不是遗漏</b>：付款起 3 天到期自动取消曾在本表，
 * 它误杀的是买家还想要的单；现在 {@code ship_expire_at} 只作为两侧的提醒依据下发。
 */
@Schema(enumAsRef = true)
public enum OrderTimeout {

    /** 已发货超时未确认：自动确认收货 */
    RECEIVE(OrderStatus.SHIPPED, Order::getReceiveExpireAt, "超时未确认自动收货", OrderTransitionService::completeUnreceived);

    private final OrderStatus from;

    private final SFunction<Order, OffsetDateTime> expireColumn;

    private final String description;

    private final BiPredicate<OrderTransitionService, Order> handler;

    OrderTimeout(
            OrderStatus from,
            SFunction<Order, OffsetDateTime> expireColumn,
            String description,
            BiPredicate<OrderTransitionService, Order> handler) {
        this.from = from;
        this.expireColumn = expireColumn;
        this.description = description;
        this.handler = handler;
    }

    /** 扫描日志用的人话描述 */
    public String description() {
        return description;
    }

    /** 只有该状态的单会被本条超时线扫到 */
    OrderStatus from() {
        return from;
    }

    /** 到期判定列；为 NULL 的行天然不匹配 */
    SFunction<Order, OffsetDateTime> expireColumn() {
        return expireColumn;
    }

    /** 单笔落点（独立事务）：抢不到转移返回 false，让位给并发的买家/卖家动作 */
    boolean handle(OrderTransitionService transitions, Order order) {
        return handler.test(transitions, order);
    }
}
