package com.shop.platform.aftersale.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.RefundAvailableAction;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.common.Money;
import com.shop.platform.order.api.OrderSummaryView;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 卖家退款工作台的一行：退款单 + 订单摘要（订单号 / 收件人 / 件数 / 首个商品名）。
 *
 * <p>工作台要能认出「是哪一单、退了多少钱、卡在哪个状态」，因此金额与动作集都随行下发；
 * 行明细不在这里（那是详情的活），列表列宽也不适合展开多行商品。
 */
@Schema(name = "SellerRefundItemResponse")
public record SellerRefundItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) String receiverName,
        @Schema(requiredMode = REQUIRED) long itemCount,
        @Schema(requiredMode = REQUIRED, nullable = true) String firstItemName,
        @Schema(requiredMode = REQUIRED) RefundType type,
        @Schema(requiredMode = REQUIRED) RefundStatus status,
        @Schema(requiredMode = REQUIRED) List<RefundAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED, nullable = true) AfterSaleReason reasonCode,
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        @Schema(requiredMode = REQUIRED) boolean noReasonEnforced,
        @Schema(requiredMode = REQUIRED) Money amount,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnCarrierName,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime succeededAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static SellerRefundItem from(Refund refund, OrderSummaryView order, List<RefundAvailableAction> actions) {
        return new SellerRefundItem(
                refund.getId(),
                refund.getOrderId(),
                order.orderNo(),
                order.receiverName(),
                order.itemCount(),
                order.firstItemName(),
                refund.getType(),
                refund.getStatus(),
                actions,
                refund.getReasonCode(),
                refund.getReason(),
                refund.isNoReasonEnforced(),
                refund.amountAsMoney(),
                refund.getReturnCarrierName(),
                refund.getReturnTrackingNo(),
                refund.getSucceededAt(),
                refund.getCreatedAt(),
                refund.getUpdatedAt());
    }
}
