package com.shop.platform.order.model;

import java.time.Duration;

/**
 * 订单四个时间窗口的唯一出处。每个窗口都是「某动作回填截止列 → 定时任务扫到期 → 自动落下一态」的三件套，
 * 天数散写在各转移点必然漂移，故集中在此。
 */
public final class OrderTimeouts {

    /** 下单起算：主订单待支付窗口，到期自动关单（orders.trades.pay_expire_at） */
    public static final Duration PAY = Duration.ofMinutes(15);

    /**
     * 付款起算：卖家发货窗口（ship_expire_at）。<b>只作提醒依据，不驱动任何自动转移</b>——
     * 到期自动取消会误杀买家仍想要的单，买家的选择权是他自己的取消按钮（ORD-20/27）。
     */
    public static final Duration SHIP = Duration.ofDays(3);

    /**
     * 确认收货窗口（receive_expire_at），到期自动确认收货。两个起算点：
     * 交寄时按交寄时刻先铺一个兜底（物流迟迟不签收也不能让单悬着），
     * 物流全部签收时由 logistics 经 order :: api 从最后一张签收时刻重算——用户看到的是「签收后还有 7 天」。
     * 签收事实齐全时订单会直接完成，这个窗口只兜承运商不推签收的情况。
     */
    public static final Duration RECEIVE = Duration.ofDays(7);

    /** 完成起算（买家确认收货或 RECEIVE 到期自动确认，同一时刻）：售后申请窗口，过期不再受理（apply_expire_at，申请时的条件更新即闸门） */
    public static final Duration AFTER_SALE_APPLY = Duration.ofDays(15);

    /**
     * 买家一次延长收货的额度（ORD-63）：从<b>当前截止时刻</b>往后推，不是「从现在 + 7 天」。
     *
     * <p>从当前截止起算而不是从点击时刻起算：截止列可能已经过去一部分（「还剩 2 天」时点延长，
     * 语义是「再多给我 7 天」），从点击起算会让买家少拿的那 2 天凭空消失。
     */
    public static final Duration RECEIVE_EXTENSION = Duration.ofDays(7);

    /**
     * 可延长次数的上限（ORD-63）：<b>1 次</b>。
     *
     * <p>不设 0 也不放开：无限次延长等于买家永久占住库存不确认收货，卖家的钱与货无限期悬着；
     * 也不给多次，是因为 7 天已能覆盖绝大多数「出差/维修/换货」诉求，真不够时走售后（AFS 线）才是正解。
     */
    public static final int MAX_RECEIVE_EXTENSIONS = 1;

    private OrderTimeouts() {}
}
