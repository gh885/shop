package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.TradeStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/** 创建结果里的主订单：一次支付的载体，payExpireAt 供收银台倒计时 */
@Schema(name = "CreatedTrade")
public record CreatedTradeView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String tradeNo,
        @Schema(requiredMode = REQUIRED) TradeStatus status,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt,
        @Schema(requiredMode = REQUIRED) List<CreatedOrderView> orders) {

    public static CreatedTradeView from(OrderService.CreatedTrade created) {
        return new CreatedTradeView(
                created.trade().getId(),
                created.trade().getTradeNo(),
                created.trade().getStatus(),
                created.trade().payAmountAsMoney(),
                created.trade().getPayExpireAt(),
                created.orders().stream().map(CreatedOrderView::from).toList());
    }
}
