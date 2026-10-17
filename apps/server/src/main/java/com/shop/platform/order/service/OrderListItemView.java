package com.shop.platform.order.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.model.OrderAvailableAction;
import com.shop.platform.order.model.OrderStatus;
import com.shop.platform.order.model.TradeStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 列表卡片：够渲染一行订单即可；详情页独有的大字段（地址/物流/留言）不进列表 */
@Schema(name = "OrderListItemResponse")
public record OrderListItemView(
        @Schema(requiredMode = REQUIRED) UUID id,
        /** 所属主订单：一次多店结算会出多张子订单，前端按它归组 */
        @Schema(requiredMode = REQUIRED) UUID tradeId,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) OrderStatus status,
        /** 支付生死在主订单：子订单「待付款」档靠它判断，批次⑤切到主订单列表后移除 */
        @Schema(requiredMode = REQUIRED) TradeStatus tradeStatus,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED, nullable = true) String shopName,
        /** 卡片按钮组：与详情同一套动作来源（后端状态机），前端不按状态另推一张表 */
        @Schema(requiredMode = REQUIRED) List<OrderAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED) Money payAmount,
        /** 支付截止在主订单上 */
        @Schema(requiredMode = REQUIRED) OffsetDateTime payExpireAt,
        /** 发货时限（付款时回填，未付款为 null）：只用于两侧的「卖家该发货了」提醒，系统不代做决定（ORD-27） */
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime shipExpireAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) List<OrderItemView> items) {

    public static OrderListItemView from(OrderWithItems o, Map<UUID, String> shopNames) {
        return new OrderListItemView(
                o.order().getId(),
                o.order().getTradeId(),
                o.order().getOrderNo(),
                o.order().getStatus(),
                o.trade().getStatus(),
                o.order().getShopId(),
                // 店铺已注销时查不到名字：诚实返回 null，不用 "" 冒充「有一家名字为空的店」
                shopNames.get(o.order().getShopId()),
                o.order().buyerActions(),
                o.order().payAmountAsMoney(),
                o.trade().getPayExpireAt(),
                o.order().getShipExpireAt(),
                o.order().getCreatedAt(),
                o.items().stream().map(OrderItemView::from).toList());
    }
}
