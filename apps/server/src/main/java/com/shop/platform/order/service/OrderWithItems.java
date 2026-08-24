package com.shop.platform.order.service;

import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import java.util.List;

/** 订单 + 行项目聚合视图 —— 列表卡片与详情页共用：渲染订单永远需要它的行。 */
public record OrderWithItems(Order order, List<OrderItem> items) {}
