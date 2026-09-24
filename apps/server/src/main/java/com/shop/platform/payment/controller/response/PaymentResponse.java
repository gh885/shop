package com.shop.platform.payment.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PaymentResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) Money amount,
        @Schema(requiredMode = REQUIRED) String channel,
        @Schema(requiredMode = REQUIRED) PaymentStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime paidAt) {

    public static PaymentResponse from(Payment p) {
        return new PaymentResponse(
                p.getId(),
                p.getOrderId(),
                p.getOrderNo(),
                p.amountAsMoney(),
                p.getChannel(),
                p.getStatus(),
                p.getPaidAt());
    }
}
