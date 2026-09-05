package com.shop.platform.order.service;

import com.baomidou.mybatisplus.core.toolkit.support.SFunction;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.function.BiPredicate;

/**
 * 三条时间驱动的超时契约 —— 一行一条：<b>什么状态的单、过了哪个截止列、到期落成什么</b>。
 * 截止列由对应动作回填（下单/付款/发货），窗口长度见 {@code OrderTimeouts}，各配部分索引即扫描全集。
 *
 * <p>做成表而不是三份扫描代码：三条线的批量扫描与逐笔委托逻辑逐字相同（见 {@link OrderTimeoutService#sweep}），
 * 差异只有这四列；加第四条超时只加一行，不必再抄一遍扫描器与调度方法。
 */
@Schema(enumAsRef = true)
public enum OrderTimeout {

    /** 待付款超时：关单并释放冻结库存 */
    PAY(OrderStatus.PENDING_PAYMENT, Order::getPayExpireAt, "超时未支付关单", OrderTransitionService::closeUnpaid),

    /** 待发货超时：自动取消，回补总库存并退款 */
    SHIP(OrderStatus.PAID, Order::getShipExpireAt, "超时未发货自动取消", OrderTransitionService::cancelUnshipped),

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

    /** 到期判定列；为 NULL 的行天然不匹配（SQL NULL 比较为 unknown），无需额外判空 */
    SFunction<Order, OffsetDateTime> expireColumn() {
        return expireColumn;
    }

    /** 单笔落点（独立事务）：抢不到转移返回 false，让位给并发的买家/卖家动作 */
    boolean handle(OrderTransitionService transitions, Order order) {
        return handler.test(transitions, order);
    }
}
