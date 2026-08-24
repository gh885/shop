package com.shop.platform.order.dto;

import jakarta.validation.constraints.Size;

/** 买家取消订单入参：原因可选，超时关单由系统写固定文案不走此入口 */
public record CancelOrderRequest(@Size(max = 200, message = "取消原因最多 200 字") String reason) {}
