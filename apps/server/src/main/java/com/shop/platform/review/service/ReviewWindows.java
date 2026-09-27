package com.shop.platform.review.service;

import java.time.OffsetDateTime;

/**
 * 评价窗口：订单完成（确认收货 / 超时自动收货）之后 **30 天**内可评（REV-03）。
 *
 * <p>这个数是本域规则，落在 review 而不是 order —— order 只给「什么时候完成的」这个事实，
 * 不替别的域定窗口（售后 15 天是它自己的规则，两条数不同也互不相干）。
 *
 * <p>刻意<b>不</b>做「超时默认好评」：默认好评把「没评价」和「给了好评」并成同一个信号，
 * 商品页的好评率就不再能说明任何事。要「未评价」的可见性，用列表里没有这一行就够了。
 */
public final class ReviewWindows {

    /** 完成后的可评天数 */
    public static final int FOLLOW_UP_DAYS = 30;

    /** 评价窗口截止时刻 = 完成时刻 + FOLLOW_UP_DAYS */
    public static OffsetDateTime deadline(OffsetDateTime completedAt) {
        return completedAt.plusDays(FOLLOW_UP_DAYS);
    }

    /** 此刻还在窗口内（completedAt 为 null = 订单未完成，恒 false） */
    public static boolean open(OffsetDateTime completedAt, OffsetDateTime now) {
        return completedAt != null && now.isBefore(deadline(completedAt));
    }

    private ReviewWindows() {}
}
