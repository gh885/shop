package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

public record CreatedOrder(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt) {

    public static CreatedOrder from(Order o) {
        return new CreatedOrder(o.getId(), o.getOrderNo(), o.getShopId(), o.payAmountAsMoney(), o.getPayExpireAt());
    }
}
