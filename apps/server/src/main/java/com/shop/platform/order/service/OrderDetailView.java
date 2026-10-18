package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.model.AfterSaleStatus;
import com.shop.platform.order.model.OrderAvailableAction;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.OrderTimeouts;
import com.shop.platform.order.model.TradeStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;

/**
 * 订单详情出参 —— 买家侧与卖家侧共用一个契约：字段本就互为镜像（卖方视角仅动作集来源不同，
 * payExpireAt 随载荷带出对卖家无害），新增字段只改这一处，两侧前端同步演进。
 * 唯一的例外是 {@code receiverPhone}：买家看自己的号是明文，卖家看买家的号是掩码（个保法最小必要，ORD-62），
 * 所以它按视角投影、不在 {@code from} 里直取。
 * 售后单本体（类型 / 回寄物流 / 退款时刻）在 aftersale 模块的 GET /orders/{id}/after-sales，这里只带订单投影。
 */
@Schema(name = "OrderDetailResponse")
public record OrderDetailView(
        @Schema(requiredMode = REQUIRED) UUID id,
        /** 所属主订单：买家详情页/收银台都按它归组 */
        @Schema(requiredMode = REQUIRED) UUID tradeId,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        /**
         * 主订单状态：子订单创建即待发货、没有「待付款」态（§5.1），所以「这笔还没付钱」只能从这一列读。
         * 详情页按它把未支付的单显示成待付款，而不是照抄子订单的待发货。
         */
        @Schema(requiredMode = REQUIRED) TradeStatus tradeStatus,
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
        @Schema(
                        requiredMode = REQUIRED,
                        description =
                                "收件人电话：买家侧是本人号码明文，卖家侧是掩码（前 3 后 4），" + "卖家取明文需 POST /seller/orders/{id}/receiver-phone")
                String receiverPhone,
        @Schema(requiredMode = REQUIRED) String receiverProvince,
        @Schema(requiredMode = REQUIRED) String receiverCity,
        @Schema(requiredMode = REQUIRED) String receiverDistrict,
        @Schema(requiredMode = REQUIRED) String receiverDetail,
        @Schema(requiredMode = REQUIRED, nullable = true) String logisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String trackingNo,
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime paidAt,
        /** 发货时限（付款时回填，未付款为 null）：两侧只拿它做「该发货了 / 超时未发货」提醒，到期不自动关单（ORD-27） */
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shipExpireAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shippedAt,
        /**
         * 确认收货截止（发货时回填）：买家侧拿它显示「还有多久自动确认」，卖家侧为 null 不用。
         * 买家延长后这列会被后推（ORD-63）。
         */
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime receiveExpireAt,
        /**
         * 买家此刻能否延长收货（ORD-63）：非状态转移，故不在 availableActions 里（那条是状态机出边），
         * 单独一列布尔把「按钮亮不亮」的口径放在后端，前端不自行推导。
         */
        @Schema(requiredMode = REQUIRED) boolean canExtendReceive,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime completedAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime cancelledAt,
        @Schema(requiredMode = REQUIRED, nullable = true) String cancelReason,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) // 售后投影（aftersale 写回）：最近一张单的状态 / 退款口径 / 申请截止
                AfterSaleStatus afterSaleStatus,
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime applyExpireAt,
        @Schema(requiredMode = REQUIRED) List<OrderItemView> items) {

    /** 买家视角：可执行动作按买家状态机推导；shopName 由 {@link OrderService#detail} 经 shop :: api 拼入 */
    public static OrderDetailView buyerView(OrderWithItems o, String shopName) {
        return from(o, shopName, Order::buyerActions, Trade::getReceiverPhone, true);
    }

    /** 卖家视角：发货作业动作；收件人电话只给掩码（明文走 reveal 端点，ORD-62） */
    public static OrderDetailView sellerView(OrderWithItems o) {
        return from(o, null, Order::sellerActions, t -> PhoneNumber.mask(t.getReceiverPhone()), false);
    }

    /**
     * 延长收货的资格（ORD-63）：四条与 mapper 的 WHERE 一一对应，故写在这里而不在前端重推一遍。
     *
     * <p>不接受「已过截止也算」：过了点就已经由超时任务转完成，此时再延长是改一个已终结的单。
     */
    private static boolean canExtendReceive(Order order, OffsetDateTime now) {
        // 计数列是 NOT NULL DEFAULT 0，但读端仍按「可能为空」写：老行/视图缺列时不该把整个详情接口打成 500
        int extended = order.getReceiveExtendedCount() == null ? 0 : order.getReceiveExtendedCount();
        return order.getStatus() == OrderStatus.SHIPPED
                && order.getDeliveredAt() == null
                && order.getReceiveExpireAt() != null
                && order.getReceiveExpireAt().isAfter(now)
                && extended < OrderTimeouts.MAX_RECEIVE_EXTENSIONS;
    }

    private static OrderDetailView from(
            OrderWithItems o,
            String shopName,
            Function<Order, List<OrderAvailableAction>> actions,
            Function<Trade, String> receiverPhone,
            boolean buyer) {
        Order order = o.order();
        Trade trade = o.trade();
        OffsetDateTime now = OffsetDateTime.now();
        return new OrderDetailView(
                // 单据身份与状态
                order.getId(),
                order.getTradeId(),
                order.getOrderNo(),
                order.getStatus(),
                trade.getStatus(),
                order.getShopId(),
                shopName,
                actions.apply(order),
                // 金额四件套：商品 + 运费 − 券 = 应付（与 orders 表 CHECK 同口径）
                order.itemAmountAsMoney(),
                order.shippingFeeAsMoney(),
                order.discountAmountAsMoney(),
                order.payAmountAsMoney(),
                order.getUserCouponId(),
                // 留言 + 收货快照（主订单上，下单定格；卖家侧即面单信息）
                trade.getBuyerMessage(),
                trade.getReceiverName(),
                receiverPhone.apply(trade),
                trade.getReceiverProvince(),
                trade.getReceiverCity(),
                trade.getReceiverDistrict(),
                trade.getReceiverDetail(),
                // 物流回填
                order.getLogisticsCompany(),
                order.getTrackingNo(),
                // 时间戳留痕：付款截止（主订单）+ 各状态时刻
                trade.getPayExpireAt(),
                order.getPaidAt(),
                order.getShipExpireAt(),
                order.getShippedAt(),
                // 买家侧才需要收货窗口与延长资格：卖家不参与这个动作
                buyer ? order.getReceiveExpireAt() : null,
                buyer && canExtendReceive(order, now),
                order.getCompletedAt(),
                order.getCancelledAt(),
                order.getCancelReason(),
                order.getCreatedAt(),
                // 售后投影：订单只记「最近一张单到哪了、退多少」，单据在 aftersale、资金态在 payment；无售后时退款额为 NULL
                order.getAfterSaleStatus(),
                order.refundAmountAsMoney(),
                order.getApplyExpireAt(),
                // 行项目
                o.items().stream().map(OrderItemView::from).toList());
    }
}
