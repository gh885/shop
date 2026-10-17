package com.shop.platform.payment.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.payment.mapper.Payment;
import com.shop.platform.payment.model.PaymentStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

@Schema(name = "PaymentResponse")
public record PaymentView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID orderId,
        @Schema(requiredMode = REQUIRED) String orderNo,
        @Schema(requiredMode = REQUIRED) Money amount,
        @Schema(requiredMode = REQUIRED) String channel,
        @Schema(requiredMode = REQUIRED) PaymentStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime paidAt,
        /** 收银台跳转地址：MOCK 渠道为 null（前端直接调确认）；支付宝渠道必填 */
        @Schema(nullable = true) String payUrl) {

    public static PaymentView from(Payment p) {
        return new PaymentView(
                p.getId(),
                p.getOrderId(),
                p.getOrderNo(),
                p.amountAsMoney(),
                p.getChannel(),
                p.getStatus(),
                p.getPaidAt(),
                p.getPayUrl());
    }
}
