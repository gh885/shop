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
import java.util.function.Function;

/**
 * 订单详情出参 —— 买家侧与卖家侧共用一个契约：字段本就互为镜像（卖方视角仅动作集来源不同，
 * payExpireAt 随载荷带出对卖家无害），新增字段只改这一处，两侧前端同步演进。
 * 售后单本体（类型 / 回寄物流 / 退款时刻）在 aftersale 模块的 GET /orders/{id}/after-sales，这里只带订单投影。
 */
public record OrderDetailResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED, nullable = true) String shopName,
        @Schema(requiredMode = REQUIRED) List<OrderAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED) Money itemAmount,
        @Schema(requiredMode = REQUIRED) Money shippingFee,
        /** 券减免额；没用券为 0 */
        @Schema(requiredMode = REQUIRED) Money discountAmount,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        /** 核销的券；没用券为 null */
        @Schema(requiredMode = REQUIRED, nullable = true) UUID userCouponId,
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
        @Schema(requiredMode = REQUIRED) // 售后投影（aftersale 写回）：最近一张单的状态 / 退款口径 / 申请截止
                AfterSaleStatus afterSaleStatus,
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime applyExpireAt,
        @Schema(requiredMode = REQUIRED) List<OrderItemResponse> items) {

    /** 买家视角：可执行动作按买家状态机推导；shopName 由调用方（order controller）经 shop :: api 拼入 */
    public static OrderDetailResponse buyerView(OrderWithItems o, String shopName) {
        return from(o, shopName, Order::buyerActions);
    }

    /** 卖家视角：发货作业动作 */
    public static OrderDetailResponse sellerView(OrderWithItems o) {
        return from(o, null, Order::sellerActions);
    }

    private static OrderDetailResponse from(
            OrderWithItems o, String shopName, Function<Order, List<OrderAvailableAction>> actions) {
        Order order = o.order();
        return new OrderDetailResponse(
                // 单据身份与状态
                order.getId(),
                order.getOrderNo(),
                order.getStatus(),
                order.getShopId(),
                shopName,
                actions.apply(order),
                // 金额四件套：商品 + 运费 − 券 = 应付（与 orders 表 CHECK 同口径）
                order.itemAmountAsMoney(),
                order.shippingFeeAsMoney(),
                order.discountAmountAsMoney(),
                order.payAmountAsMoney(),
                order.getUserCouponId(),
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
                // 售后投影：订单只记「最近一张单到哪了、退多少」，单据在 aftersale、资金态在 payment；无售后时退款额为 NULL
                order.getAfterSaleStatus(),
                order.refundAmountAsMoney(),
                order.getApplyExpireAt(),
                // 行项目
                o.items().stream().map(OrderItemResponse::from).toList());
    }
}
