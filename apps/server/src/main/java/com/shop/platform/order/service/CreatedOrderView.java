package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/** 创建结果里的子订单：主订单负责倒计时与合并支付，子订单只报「拆到了哪家店、该店应付多少」 */
@Schema(name = "CreatedOrder")
public record CreatedOrderView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) Money payAmount) {

    public static CreatedOrderView from(Order o) {
        return new CreatedOrderView(o.getId(), o.getOrderNo(), o.getShopId(), o.payAmountAsMoney());
    }
}
