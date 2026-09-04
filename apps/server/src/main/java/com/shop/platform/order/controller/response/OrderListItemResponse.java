package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderWithItems;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 列表卡片：够渲染一行订单即可；详情页独有的大字段（地址/物流/留言）不进列表 */
public record OrderListItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED, nullable = true) String shopName,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) List<OrderItemResponse> items) {

    public static OrderListItemResponse from(OrderWithItems o, Map<UUID, String> shopNames) {
        return new OrderListItemResponse(
                o.order().getId(),
                o.order().getOrderNo(),
                o.order().getStatus(),
                o.order().getShopId(),
                // 店铺已注销时查不到名字：诚实返回 null，不用 "" 冒充「有一家名字为空的店」
                shopNames.get(o.order().getShopId()),
                o.order().payAmountAsMoney(),
                o.order().getPayExpireAt(),
                o.order().getCreatedAt(),
                o.items().stream().map(OrderItemResponse::from).toList());
    }
}
