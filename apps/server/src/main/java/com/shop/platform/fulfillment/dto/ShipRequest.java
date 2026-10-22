package com.shop.platform.fulfillment.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 卖家发货入参。
 *
 * <p>{@code sellerOrderId} 在路径里，不在请求体里——它是资源标识，放 body 会让人以为能改。
 */
public record ShipRequest(
        @NotBlank @Size(max = 32) String carrierCode,
        @NotBlank @Size(max = 64) String trackingNo,
        @NotEmpty @Valid List<Item> items) {

    /**
     * @param lineNo 订单行号，与 {@code order_line.line_no} 一致
     * @param quantity 这个包裹里该行装几件。校验上限在 service，那里能拿到剩余可发量
     */
    public record Item(@NotNull @Min(1) Integer lineNo, @Positive Integer quantity) {}
}
