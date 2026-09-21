package com.shop.platform.aftersale.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.model.TicketAvailableAction;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 售后单出参 —— 买家侧与卖家侧共用：字段本就互为镜像，资金态在 payment，这里只有口径与时刻。
 *
 * <p>{@link #availableActions} 是<b>当前视角</b>的可执行动作集（买家端点给买家口径、卖家端点给卖家口径，
 * 与订单侧 availableActions 同款约定）：按钮组只吃这一个字段，不再按状态在前端复刻转移表。
 */
public record TicketResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) TicketType type,
        @Schema(requiredMode = REQUIRED) TicketStatus status,
        @Schema(requiredMode = REQUIRED) List<TicketAvailableAction> availableActions,
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnLogisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime refundedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static TicketResponse from(Ticket t, List<TicketAvailableAction> availableActions) {
        return new TicketResponse(
                t.getId(),
                t.getOrderId(),
                t.getType(),
                t.getStatus(),
                availableActions,
                t.getReason(),
                t.refundAmountAsMoney(),
                t.getReturnLogisticsCompany(),
                t.getReturnTrackingNo(),
                t.getRefundedAt(),
                t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
