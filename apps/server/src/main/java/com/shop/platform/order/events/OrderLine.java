package com.shop.platform.order.events;

import java.util.UUID;

/** 订单行参与库存结算的最小投影：SKU + 数量。两个订单事件共用，字段即 product 模块扣减/回补所需的全部。 */
public record OrderLine(UUID skuId, int quantity) {}
