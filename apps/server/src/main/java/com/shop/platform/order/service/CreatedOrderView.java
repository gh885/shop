package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

@Schema(name = "CreatedOrder")
public record CreatedOrderView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt) {

    public static CreatedOrderView from(Order o) {
        return new CreatedOrderView(o.getId(), o.getOrderNo(), o.getShopId(), o.payAmountAsMoney(), o.getPayExpireAt());
    }
}
