package com.shop.platform.aftersale.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.aftersale.mapper.Ticket;
import com.shop.platform.aftersale.model.TicketStatus;
import com.shop.platform.aftersale.model.TicketType;
import com.shop.platform.common.Money;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 售后单出参 —— 买家侧与卖家侧共用：字段本就互为镜像，资金态在 payment，这里只有口径与时刻。 */
public record TicketResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) TicketType type,
        @Schema(requiredMode = REQUIRED) TicketStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        @Schema(requiredMode = REQUIRED, nullable = true) Money refundAmount,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnLogisticsCompany,
        @Schema(requiredMode = REQUIRED, nullable = true) String returnTrackingNo,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime refundedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static TicketResponse from(Ticket t) {
        return new TicketResponse(
                t.getId(),
                t.getOrderId(),
                t.getType(),
                t.getStatus(),
                t.getReason(),
                t.refundAmountAsMoney(),
                t.getReturnLogisticsCompany(),
                t.getReturnTrackingNo(),
                t.getRefundedAt(),
                t.getCreatedAt(),
                t.getUpdatedAt());
    }
}
