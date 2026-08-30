package com.shop.platform.order.controller;

import com.shop.platform.common.Money;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.service.OrderWithItems;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * 订单详情出参 —— 买家侧与卖家侧共用一个契约：字段本就互为镜像（卖方视角仅动作集来源不同，
 * payExpireAt 随载荷带出对卖家无害），新增字段只改这一处，两侧前端同步演进。
 */
public record OrderDetailResponse(
        UUID id,
        String orderNo,
        String status,
        UUID shopId,
        String shopName,
        List<String> availableActions,
        Money itemAmount,
        Money shippingFee,
        Money payAmount,
        String buyerMessage,
        String receiverName,
        String receiverPhone,
        String receiverProvince,
        String receiverCity,
        String receiverDistrict,
        String receiverDetail,
        String logisticsCompany,
        String trackingNo,
        OffsetDateTime payExpireAt,
        OffsetDateTime paidAt,
        OffsetDateTime shippedAt,
        OffsetDateTime completedAt,
        OffsetDateTime cancelledAt,
        String cancelReason,
        OffsetDateTime createdAt,
        // 售后线（与履约主状态机正交）：状态 / 类型 / 退款额 / 退款完成时刻 / 申请截止
        String afterSaleStatus,
        String afterSaleType,
        Money refundAmount,
        OffsetDateTime afterSaleRefundedAt,
        OffsetDateTime applyExpireAt,
        // 退货退款：买家回寄物流（仅退货退款、已有回寄时非空）
        String returnLogisticsCompany,
        String returnTrackingNo,
        List<OrderItemResponse> items) {

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
                order.getStatus().name(),
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
                order.getAfterSaleStatus().name(),
                order.getAfterSaleType() == null
                        ? null
                        : order.getAfterSaleType().name(),
                order.refundAmountAsMoney(),
                order.getAfterSaleRefundedAt(),
                order.getApplyExpireAt(),
                order.getReturnLogisticsCompany(),
                order.getReturnTrackingNo(),
                // 行项目
                o.items().stream().map(OrderItemResponse::from).toList());
    }
}
