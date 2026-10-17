package com.shop.platform.payment.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.order.api.TradePaymentView;
import com.shop.platform.payment.mapper.Payment;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 主订单支付批次视图：整笔应付 + 逐子订单流水（复用 {@link PaymentView} 形状）。
 * 收银台按 totalAmount 展示合计、按 payments 列出每张子订单；是否已付清由每条 payment 的 status 体现。
 */
@Schema(name = "CheckoutPaymentResponse")
public record PaymentBatchView(
        @Schema(requiredMode = REQUIRED) UUID tradeId,
        @Schema(requiredMode = REQUIRED) String tradeNo,
        @Schema(requiredMode = REQUIRED) Money totalAmount,
        @Schema(requiredMode = REQUIRED) List<PaymentView> payments) {

    public static PaymentBatchView from(TradePaymentView trade, List<Payment> rows) {
        return new PaymentBatchView(
                trade.tradeId(),
                trade.tradeNo(),
                trade.payAmount(),
                rows.stream().map(PaymentView::from).toList());
    }
}
