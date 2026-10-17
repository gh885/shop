package com.shop.platform.order.service;

import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.Trade;
import java.util.List;

/** 子订单 + 行项目 + 所属主订单：列表卡片与详情页共用，收货快照与支付时限从主订单取。 */
public record OrderWithItems(Order order, List<OrderItem> items, Trade trade) {}
