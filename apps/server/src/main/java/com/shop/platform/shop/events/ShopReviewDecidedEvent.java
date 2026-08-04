package com.shop.platform.shop.events;

import java.util.UUID;

/** 店铺审核决定事件：admin 审批后发布，shop 模块监听后把店铺状态改为 ACTIVE / REJECTED */
public record ShopReviewDecidedEvent(UUID shopId, boolean approved, String reason) {}
