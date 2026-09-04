package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderWithItems;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 列表卡片：买家收货人摘要 + 行项目数，发货作业先扫一眼再进详情；详情与买家侧共用 OrderDetailResponse */
public record SellerOrderListItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) long itemCount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static SellerOrderListItemResponse from(OrderWithItems o) {
        Order order = o.order();
        return new SellerOrderListItemResponse(
                order.getId(),
                order.getOrderNo(),
                order.getStatus(),
                order.payAmountAsMoney(),
                order.getReceiverName(),
                o.items().size(),
                order.getCreatedAt());
    }
}
