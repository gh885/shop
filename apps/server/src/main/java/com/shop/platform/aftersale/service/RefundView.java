package com.shop.platform.aftersale.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.mapper.Refund;
import com.shop.platform.aftersale.mapper.RefundLine;
import com.shop.platform.aftersale.model.AfterSaleReason;
import com.shop.platform.aftersale.model.RefundAvailableAction;
import com.shop.platform.aftersale.model.RefundLineType;
import com.shop.platform.aftersale.model.RefundStatus;
import com.shop.platform.aftersale.model.RefundType;
import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 退款单详情出参 —— 买家与卖家共用一个契约，动作集按视角下发。
 *
 * <p>{@code returnAddress} 只在买家详情回填（查询时经 shop :: api 实时解析默认退货地址，不存快照）；
 * 卖家详情与工作台一律为 null。字段可空而不是另开一个形状：它和退款单本体同一次请求，拆两包只是多一次拼装。
 *
 * <p>金额是整单口径（{@code amount}），行明细（{@code lines}）解释它由哪些商品/运费/补偿构成——
 * 客户端不重算总额，总额是落库事实。
 */
@Schema(name = "RefundResponse")
public record RefundView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) String refundNo,
        @Schema(requiredMode = REQUIRED) RefundType type,
        @Schema(requiredMode = REQUIRED) RefundStatus status,
        @Schema(requiredMode = REQUIRED) List<RefundAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED) Money amount,
        @Schema(requiredMode = REQUIRED, nullable = true) AfterSaleReason reasonCode,
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        /** 七天无理由强制单：申请阶段卖家不得拒绝（AFS-45），随详情下发是为了让「没有拒绝按钮」可解释 */
        @Schema(requiredMode = REQUIRED) boolean noReasonEnforced,
        @Schema(requiredMode = REQUIRED, nullable = true) String rejectReason,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnCarrierName,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        /** 卖家默认退货地址（一行串）：仅买家详情解析，其余场景为 null（AFS-42） */
        @Schema(requiredMode = REQUIRED, nullable = true) String returnAddress,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime succeededAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt,
        @Schema(requiredMode = REQUIRED) List<Line> lines) {

    /** 一行钱：item 型挂订单行与数量，shipping / compensation 型两者为空 */
    @Schema(name = "RefundLineResponse")
    public record Line(
            @Schema(requiredMode = REQUIRED, nullable = true) UUID orderItemId,
            @Schema(requiredMode = REQUIRED, nullable = true) String name,
            @Schema(requiredMode = REQUIRED) RefundLineType lineType,
            @Schema(requiredMode = REQUIRED, nullable = true) Integer quantity,
            @Schema(requiredMode = REQUIRED) Money amount) {}

    /**
     * @param itemNames 订单行 id → 商品名（卖家/买家详情从 order :: api 取，列表不拼）
     */
    public static RefundView from(
            Refund refund,
            List<RefundLine> lines,
            Map<UUID, String> itemNames,
            List<RefundAvailableAction> actions,
            String returnAddress) {
        return new RefundView(
                refund.getId(),
                refund.getOrderId(),
                refund.getRefundNo(),
                refund.getType(),
                refund.getStatus(),
                actions,
                refund.amountAsMoney(),
                refund.getReasonCode(),
                refund.getReason(),
                refund.isNoReasonEnforced(),
                refund.getRejectReason(),
                refund.getReturnCarrierName(),
                refund.getReturnTrackingNo(),
                returnAddress,
                refund.getSucceededAt(),
                refund.getCreatedAt(),
                refund.getUpdatedAt(),
                lines.stream()
                        .map(l -> new Line(
                                l.getOrderItemId(),
                                l.getOrderItemId() == null ? null : itemNames.get(l.getOrderItemId()),
                                l.getLineType(),
                                l.getQuantity(),
                                l.amountAsMoney()))
                        .toList());
    }
}
