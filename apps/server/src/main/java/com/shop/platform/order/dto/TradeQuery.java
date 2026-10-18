package com.shop.platform.order.dto;

/**
 * 主订单列表筛选：progress 对应买家端「待付款/待发货/部分发货/待收货/已完成」页签，空 = 全部。
 *
 * <p>筛的是<b>主进度投影</b>（docs/domain/order-model.md §5.3）而不是子订单状态——列表以主订单为单位，
 * 一次多店结算只出一行，按子订单状态筛会出现「同一张卡在两个页签里都算」的分裂。
 * 取值合法性由 service 校验（非法值 400）。
 */
public record TradeQuery(String progress) {}
