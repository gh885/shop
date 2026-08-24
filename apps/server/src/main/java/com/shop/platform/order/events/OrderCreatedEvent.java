package com.shop.platform.order.events;

import java.util.List;
import java.util.UUID;

/**
 * 订单创建事件：下单事务内发布，product 模块同步监听做条件扣减（WHERE stock >= n），
 * 任一行不足即抛异常令整个下单回滚——防超卖的最终闸门与下单原子。
 */
public record OrderCreatedEvent(UUID orderId, List<OrderLine> lines) {}
