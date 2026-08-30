package com.shop.platform.order.model;

import java.time.Duration;

/**
 * 订单四个时间窗口的唯一出处。每个窗口都是「某动作回填截止列 → 定时任务扫到期 → 自动落下一态」的三件套，
 * 天数散写在各转移点必然漂移，故集中在此。到期后果与扫描规则见 order.service 的 OrderTimeout。
 */
public final class OrderTimeouts {

    /** 下单起算：待付款窗口，到期自动关单（pay_expire_at） */
    public static final Duration PAY = Duration.ofMinutes(15);

    /** 付款起算：卖家发货窗口，到期自动取消并退款（ship_expire_at） */
    public static final Duration SHIP = Duration.ofDays(3);

    /** 发货起算：买家确认收货窗口，到期自动确认收货（receive_expire_at） */
    public static final Duration RECEIVE = Duration.ofDays(7);

    /** 收货起算：售后申请窗口，过期不再受理（apply_expire_at，申请时的条件更新即闸门） */
    public static final Duration AFTER_SALE_APPLY = Duration.ofDays(15);

    private OrderTimeouts() {}
}
