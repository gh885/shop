package com.shop.platform.order.api;

import java.util.UUID;

/**
 * 订单行项的跨模块投影：SKU + 件数（aftersale 退货收货回补库存用）+ 无理由退货声明快照
 * （aftersale 判七天无理由强制用，AFS-45），不带价格快照。
 */
public record OrderLineView(UUID skuId, int quantity, boolean sevenDayReturn) {}
