package com.shop.platform.order.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.AfterSaleType;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.service.OrderWithItems;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * 订单详情出参 —— 买家侧与卖家侧共用一个契约：字段本就互为镜像（卖方视角仅动作集来源不同，
 * payExpireAt 随载荷带出对卖家无害），新增字段只改这一处，两侧前端同步演进。
 */
public record OrderDetailResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED, nullable = true) String shopName,
        @Schema(requiredMode = REQUIRED) List<String> availableActions,
        @Schema(requiredMode = REQUIRED) Money itemAmount,
        @Schema(requiredMode = REQUIRED) Money shippingFee,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) String buyerMessage,
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) String receiverPhone,
        @Schema(requiredMode = REQUIRED) String receiverProvince,
        @Schema(requiredMode = REQUIRED) String receiverCity,
        @Schema(requiredMode = REQUIRED) String receiverDistrict,
        @Schema(requiredMode = REQUIRED) String receiverDetail,
        @Schema(requiredMode = REQUIRED, nullable = true) String logisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String trackingNo,
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime paidAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shippedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime completedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime cancelledAt,
        @Schema(requiredMode = REQUIRED, nullable = true) String cancelReason,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) // 售后线（与履约主状态机正交）：状态 / 类型 / 退款额 / 退款完成时刻 / 申请截止
                AfterSaleStatus afterSaleStatus,
        @Schema(requiredMode = REQUIRED, nullable = true) AfterSaleType afterSaleType,
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime afterSaleRefundedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime applyExpireAt,
        @Schema(requiredMode = REQUIRED, nullable = true) // 退货退款：买家回寄物流（仅退货退款、已有回寄时非空）
                String returnLogisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        @Schema(requiredMode = REQUIRED) List<OrderItemResponse> items) {

    /** 买家视角：可执行动作按买家状态机推导；shopName 由调用方（order controller）经 shop :: api 拼入 */
    public static OrderDetailResponse buyerView(OrderWithItems o, String shopName) {
        return from(o, shopName, Order::buyerActions);
    }

    /** 卖家视角：发货作业动作 */
    public static OrderDetailResponse sellerView(OrderWithItems o) {
        return from(o, null, Order::sellerActions);
    }

    private static OrderDetailResponse from(OrderWithItems o, String shopName, Function<Order, List<String>> actions) {
        Order order = o.order();
        return new OrderDetailResponse(
                // 单据身份与状态
                order.getId(),
                order.getOrderNo(),
                order.getStatus(),
                order.getShopId(),
                shopName,
                actions.apply(order),
                // 金额三件套
                order.itemAmountAsMoney(),
                order.shippingFeeAsMoney(),
                order.payAmountAsMoney(),
                // 留言 + 收货快照（下单定格；卖家侧即面单信息）
                order.getBuyerMessage(),
                order.getReceiverName(),
                order.getReceiverPhone(),
                order.getReceiverProvince(),
                order.getReceiverCity(),
                order.getReceiverDistrict(),
                order.getReceiverDetail(),
                // 物流回填
                order.getLogisticsCompany(),
                order.getTrackingNo(),
                // 时间戳留痕：付款截止 + 各状态时刻
                order.getPayExpireAt(),
                order.getPaidAt(),
                order.getShippedAt(),
                order.getCompletedAt(),
                order.getCancelledAt(),
                order.getCancelReason(),
                order.getCreatedAt(),
                // 售后线：订单只记「退多少、退没退」，资金态在 payment 模块；无售后时类型/退款额为 NULL
                order.getAfterSaleStatus(),
                order.getAfterSaleType(),
                order.refundAmountAsMoney(),
                order.getAfterSaleRefundedAt(),
                order.getApplyExpireAt(),
                order.getReturnLogisticsCompany(),
                order.getReturnTrackingNo(),
                // 行项目
                o.items().stream().map(OrderItemResponse::from).toList());
    }
}
