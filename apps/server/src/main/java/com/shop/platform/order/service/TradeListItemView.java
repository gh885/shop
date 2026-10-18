package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.api.AfterSaleBadge;
import com.shop.platform.order.mapper.Order;
import com.shop.platform.order.mapper.OrderItem;
import com.shop.platform.order.mapper.Trade;
import com.shop.platform.order.model.MainProgress;
import com.shop.platform.order.model.OrderAvailableAction;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.TradeStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 买家订单列表的卡片 = <b>一张主订单</b>（一次结算），不是一张子订单。
 *
 * <p>为什么以主订单为单位：买家眼里「我买的那一单」就是结算的那一次，多店拆单是平台内部的账（§2）。
 * 支付、主进度、支付截止都在主订单上；店铺、行项、履约动作在子订单上。一张卡片因此是一个主订单 + N 个店铺段。
 *
 * <p>{@code mainProgress} 由 {@code orders.trade_progress} 视图给出（§5.3），是投影不是列：
 * 同一份事实在列表筛选与详情展示上用同一个算法，前端不重现那七条规则。
 *
 * <p>作列表行与收银台详情共用：收银台要的是「这一笔总共多少钱、拆成哪几单」，正好是同一形状。
 */
@Schema(name = "TradeListItemResponse")
public record TradeListItemView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String tradeNo,
        @Schema(requiredMode = REQUIRED) TradeStatus status,
        /** 买家主进度（§5.3）：待付款 / 待发货 / 部分发货 / 待收货 / 已完成 / 已关闭 */
        @Schema(requiredMode = REQUIRED) MainProgress mainProgress,
        /** 主订单级售后角标（§5.4）：与主进度叠加展示，如「部分发货 · 退款中」 */
        @Schema(requiredMode = REQUIRED) AfterSaleBadge afterSaleBadge,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        /** 支付截止（主订单上）：卡片倒计时只读它 */
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        /** 本次结算拆出的子订单，按店铺分组展示；全部已取消时也是全集（卡片据此折叠） */
        @Schema(requiredMode = REQUIRED) List<TradeOrderView> orders) {

    public static TradeListItemView from(Trade trade, MainProgress mainProgress, List<TradeOrderView> orders) {
        return new TradeListItemView(
                trade.getId(),
                trade.getTradeNo(),
                trade.getStatus(),
                mainProgress,
                trade.getAfterSaleBadge(),
                trade.payAmountAsMoney(),
                trade.getPayExpireAt(),
                trade.getCreatedAt(),
                orders);
    }

    /**
     * 卡片里的一个店铺段：子订单自己的履约状态、按钮组与行项。
     *
     * <p>动作仍按子订单给（取消 / 确认收货是子订单的动作），支付不在其中——付款是主订单的动作（见
     * {@link OrderAvailableAction}），由卡片按 {@code mainProgress} 决定要不要给「去支付」。
     */
    @Schema(name = "TradeOrderResponse")
    public record TradeOrderView(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String orderNo,
            @Schema(requiredMode = REQUIRED) UUID shopId,
            @Schema(requiredMode = REQUIRED, nullable = true) String shopName,
            @Schema(requiredMode = REQUIRED) OrderStatus status,
            @Schema(requiredMode = REQUIRED) List<OrderAvailableAction> availableActions,
            @Schema(requiredMode = REQUIRED) Money payAmount,
            /** 发货时限（付款时回填）：只做「卖家该发货了」的催办提示，到期不自动关单（ORD-27） */
            @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shipExpireAt,
            @Schema(requiredMode = REQUIRED) List<OrderItemView> items) {

        public static TradeOrderView from(Order order, List<OrderItem> items, Map<UUID, String> shopNames) {
            return new TradeOrderView(
                    order.getId(),
                    order.getOrderNo(),
                    order.getShopId(),
                    // 店铺已注销时查不到名字：诚实返回 null，不用 "" 冒充「有一家名字为空的店」
                    shopNames.get(order.getShopId()),
                    order.getStatus(),
                    order.buyerActions(),
                    order.payAmountAsMoney(),
                    order.getShipExpireAt(),
                    items.stream().map(OrderItemView::from).toList());
        }
    }
}
