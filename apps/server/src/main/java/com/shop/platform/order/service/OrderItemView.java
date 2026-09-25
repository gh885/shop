package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.OrderItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 订单行项目出参：快照字段原样透出，amount 供详情页小计展示（买家/卖家详情共用） */
@Schema(name = "OrderItemResponse")
public record OrderItemView(
        @Schema(requiredMode = REQUIRED) UUID productId,
        @Schema(requiredMode = REQUIRED) UUID skuId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED) Money price,
        @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
        @Schema(requiredMode = REQUIRED) Integer quantity,
        @Schema(requiredMode = REQUIRED) Money amount) {

    public static OrderItemView from(OrderItem i) {
        return new OrderItemView(
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
