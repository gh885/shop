package com.shop.platform.returns.api;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 售后单的对外视图。
 *
 * <p>{@code deadline*} 三列一起返回：调用方（买家页、商家页）要显示"还剩多久、该谁动"，
 * 而不是自己按状态猜。
 */
public record CaseView(
        UUID id,
        String caseNo,
        UUID sellerOrderId,
        UUID buyerId,
        UUID merchantId,
        String type,
        String status,
        String reasonCode,
        String responsibility,
        long refundAmount,
        long shippingRefundAmount,
        String currency,
        Instant deadlineAt,
        String deadlineActor,
        String deadlineAction,
        Instant createdAt,
        List<ItemView> items) {

    /** 一行退多少。退款上限按行实付算，不按原价算。 */
    @Schema(name = "RmaCaseItemView")
    public record ItemView(UUID orderLineId, int quantity, long refundAmount) {}
}
