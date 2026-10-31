package com.shop.platform.payment.api;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.UUID;

/**
 * 给前端的支付单视图。
 *
 * @param payUrl 渠道跳转地址；null 表示这个渠道不需要跳转（mock 直接确认）
 */
public record PaymentView(
        UUID paymentId,
        String paymentNo,
        UUID orderGroupId,
        long amount,
        String currency,
        String status,
        Instant expiresAt,
        // mock 渠道不需要跳转，恒 null
        @Schema(nullable = true) String payUrl) {}
