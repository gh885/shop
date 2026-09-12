package com.shop.platform.order.api;

import java.util.UUID;

/**
 * 订单摘要的跨模块投影：卖家售后工作台列本店售后单时，用来给每张单补上「是哪一单、谁买的、买的什么」。
 *
 * <p>只带展示要用到的四样：订单号（卖家要凭它去查单）、收货人（买家是谁）、行数、首个商品名（大致认得这单）。
 * 金额不在其中——退款口径在售后单自己身上，跨模块再传一份就会有两个可能漂移的口径。
 */
public record OrderSummaryView(
        UUID orderId, String orderNo, String receiverName, long itemCount, String firstItemName) {}
