package com.shop.platform.shop.events;

import java.util.UUID;

/** 店铺创建事件：开店落库后发布，admin 模块监听后入队一条 PENDING 审核记录 */
public record ShopCreatedEvent(UUID shopId, UUID ownerId) {}
