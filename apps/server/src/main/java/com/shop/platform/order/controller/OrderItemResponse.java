package com.shop.platform.order.controller;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.OrderItem;
import java.util.UUID;

/** 订单行项目出参：快照字段原样透出，amount 供详情页小计展示（买家/卖家详情共用） */
public record OrderItemResponse(
        UUID productId,
        UUID skuId,
        String name,
        String image,
        Money price,
        Money originalPrice,
        Integer quantity,
        Money amount) {

    public static OrderItemResponse from(OrderItem i) {
        return new OrderItemResponse(
                i.getProductId(),
                i.getSkuId(),
                i.getName(),
                i.getImage(),
                i.priceAsMoney(),
                i.originalPriceAsMoney(),
                i.getQuantity(),
                i.amountAsMoney());
    }
}
