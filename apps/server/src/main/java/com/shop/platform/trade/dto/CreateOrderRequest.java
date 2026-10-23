package com.shop.platform.trade.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 落单入参。
 *
 * <p><b>没有金额字段、没有地址内容。</b> 金额一律从 {@code quoteId} 指向的报价单读；
 * 地址按 {@code addressId} 从地址簿取快照。让前端传金额或地址内容，等于给
 * "落单价比结算页贵"、"收货信息被编造"各开一扇门。
 *
 * <p>{@code lines} 必须与算价时逐行一致（行号、SKU、数量），否则报价单的 fingerprint 对不上，
 * 会返回 {@code PRICE_CHANGED}。算价时进 {@code unavailable} 的失效行不能带——带了同样对不上指纹。
 */
public record CreateOrderRequest(
        @NotNull UUID quoteId,
        @NotNull UUID addressId,
        @NotEmpty @Valid List<Line> lines,
        @Size(max = 64) String idempotencyKey) {

    /**
     * 一行。{@code lineNo} 沿用报价单行号，**不重新编号**——重编号会让
     * {@code order_line_discount} 对不上行。
     */
    public record Line(
            @NotNull @Min(1) Integer lineNo,
            @NotNull UUID skuId,
            UUID offerId,
            UUID merchantId,
            @Positive Integer quantity) {}
}
