package com.shop.platform.payment.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.payment.mapper.Payment;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 合并支付批次视图：一次 checkout_key 下的总应付 + 逐单流水（复用 {@link PaymentView} 形状）。
 * 收银台按 totalAmount 展示合计、按 payments 列出每张单；是否已付清由每条 payment 的 status 体现。
 */
@Schema(name = "CheckoutPaymentResponse")
public record PaymentBatchView(
        @Schema(requiredMode = REQUIRED) UUID checkoutKey,
        @Schema(requiredMode = REQUIRED) Money totalAmount,
        @Schema(requiredMode = REQUIRED) List<PaymentView> payments) {

    public static PaymentBatchView from(UUID checkoutKey, List<Payment> rows) {
        Money total = rows.stream()
                .map(Payment::amountAsMoney)
                .reduce(Money::plus)
                .orElseThrow(() -> new IllegalStateException("合并支付批次不含任何流水"));
        return new PaymentBatchView(
                checkoutKey, total, rows.stream().map(PaymentView::from).toList());
    }
}
