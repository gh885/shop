package com.shop.platform.order.dto;

/** 订单列表筛选：status 对应买家端「待付款/待发货…」tab，空 = 全部；合法性由 service 校验 */
public record OrderQuery(String status) {}
