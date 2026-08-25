package com.shop.platform.cart.api;

import java.util.UUID;

/** 购物车条目只读视图：cart.items 的跨模块投影（order 结算取条目，归属过滤是消费方职责）。 */
public record CartLineView(UUID userId, UUID skuId, int quantity) {}
