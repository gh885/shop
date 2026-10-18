package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.model.OrderAvailableAction;
import com.shop.platform.order.model.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 卖家订单列表行：单号/买家/实付/状态/件数 + 商品行明细（列表直接展示缩略图与标题，少一跳详情）。
 * 售后角标作为与主状态正交的第二条线透出（aftersale 写回的投影），列表用徽章标识；详情与买家侧共用 OrderDetailView。
 */
@Schema(name = "SellerOrderListItemResponse")
public record SellerOrderListItemView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        @Schema(requiredMode = REQUIRED) AfterSaleBadge afterSaleBadge,
        /** 行内按钮组：与详情同一套动作来源（后端状态机的卖家视角），前端不按状态另推一张表。
         *  SHIPPED 行也带 SHIP —— 多包裹追加发货的入口（见 OrderStatus 转移表的 SHIPPED 自环） */
        @Schema(requiredMode = REQUIRED) List<OrderAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED) String receiverName,
        /** 掩码形态（前 3 后 4）：列表是批量出口，明文只经 {@code POST /seller/orders/{id}/receiver-phone} 逐单索取（ORD-62） */
        @Schema(
                        requiredMode = REQUIRED,
                        description = "收件人电话，掩码（前 3 后 4）；明文需 POST /seller/orders/{id}/receiver-phone 逐单索取")
                String receiverPhone,
        @Schema(requiredMode = REQUIRED) long itemCount,
        @Schema(requiredMode = REQUIRED) List<OrderItemView> items,
        /** 发货时限（付款时回填）：过点即「超时未发货」，是催办标记而不是系统代关单的凭据（ORD-27） */
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shipExpireAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static SellerOrderListItemView from(OrderWithItems o) {
        Order order = o.order();
        Trade trade = o.trade();
        return new SellerOrderListItemView(
                order.getId(),
                order.getOrderNo(),
                order.getStatus(),
                order.getAfterSaleBadge(),
                order.sellerActions(),
                order.payAmountAsMoney(),
                trade.getReceiverName(),
                PhoneNumber.mask(trade.getReceiverPhone()),
                o.items().size(),
                o.items().stream().map(OrderItemView::from).toList(),
                order.getShipExpireAt(),
                order.getCreatedAt());
    }
}
