package com.shop.platform.returns.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

/**
 * 买家提交售后的入参。
 *
 * <p><b>不传金额。</b> 退多少由后端按订单行实付算——让前端传钱，等于允许把退款金额改成任意数。
 */
public record AfterSaleApplyRequest(
        @NotBlank String type,
        @NotBlank String reasonCode,
        @NotNull UUID sellerOrderId,
        @NotEmpty @Valid List<Line> lines) {

    public record Line(@NotNull @Min(1) Integer lineNo, @NotNull @Min(1) Integer quantity) {}
}
