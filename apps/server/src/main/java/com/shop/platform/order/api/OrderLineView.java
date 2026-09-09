package com.shop.platform.order.api;

import java.util.UUID;

/** 订单行项的跨模块投影：SKU + 件数（aftersale 退货收货回补库存用），不带价格快照。 */
public record OrderLineView(UUID skuId, int quantity) {}
