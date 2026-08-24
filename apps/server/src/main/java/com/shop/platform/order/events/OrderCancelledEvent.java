package com.shop.platform.order.events;

import java.util.List;
import java.util.UUID;

/**
 * 订单取消事件：买家取消 / 超时自动关单后发布，product 模块同步监听按行回补库存。
 * 发布前订单状态已条件更新成功，回补与取消同事务生效。
 */
public record OrderCancelledEvent(UUID orderId, List<OrderLine> lines) {}
