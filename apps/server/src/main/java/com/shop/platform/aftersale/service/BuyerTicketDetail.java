package com.shop.platform.aftersale.service;

/**
 * 买家售后详情的附加信息 —— 只在买家详情端点回填、且<b>都不在 tickets 上存列</b>的两件事：
 *
 * <ul>
 *   <li>{@code returnAddress}：查询时经 shop :: api 解析本店默认退货地址（AFS-42，不做申请时刻快照）；
 *   <li>{@code rejectReason}：拒绝它的动作在时间线上留下的那行 note（AFS-22/30，真相只有一处）。
 * </ul>
 *
 * <p>折成一个形状而不是给 {@code TicketView.from} 再加一个可空 String 参数：两个位置相邻、都可空、
 * 语义完全不同的字符串早晚传反。服务端内部装配用，不上契约。
 */
public record BuyerTicketDetail(String returnAddress, String rejectReason) {}
