package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderAvailableAction;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderWithItems;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 卖家订单列表行：单号/买家/实付/状态/件数 + 商品行明细（列表直接展示缩略图与标题，少一跳详情）。
 * 售后状态作为与主状态正交的第二条线透出（aftersale 写回的投影），列表用徽章标识；详情与买家侧共用 OrderDetailResponse。
 */
public record SellerOrderListItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        @Schema(requiredMode = REQUIRED) AfterSaleStatus afterSaleStatus,
        /** 行内按钮组：与详情同一套动作来源（后端状态机的卖家视角），前端不按状态另推一张表。
         *  SHIPPED 行也带 SHIP —— 多包裹追加发货的入口（见 OrderStatus 转移表的 SHIPPED 自环） */
        @Schema(requiredMode = REQUIRED) List<OrderAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED, nullable = true) String receiverPhone,
        @Schema(requiredMode = REQUIRED) long itemCount,
        @Schema(requiredMode = REQUIRED) List<OrderItemResponse> items,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static SellerOrderListItemResponse from(OrderWithItems o) {
        Order order = o.order();
        return new SellerOrderListItemResponse(
                order.getId(),
                order.getOrderNo(),
                order.getStatus(),
                order.getAfterSaleStatus(),
                order.sellerActions(),
                order.payAmountAsMoney(),
                order.getReceiverName(),
                order.getReceiverPhone(),
                o.items().size(),
                o.items().stream().map(OrderItemResponse::from).toList(),
                order.getCreatedAt());
    }
}
