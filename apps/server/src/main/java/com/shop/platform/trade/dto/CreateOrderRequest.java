package com.shop.platform.trade.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

/**
 * 落单入参。
 *
 * <p><b>没有金额字段。</b> 金额一律从 {@code quoteId} 指向的报价单读。让前端传金额，
 * 等于给"落单价比结算页贵"开一扇门，而这类投诉最难解释。
 *
 * <p>{@code lines} 必须与算价时逐行一致（行号、SKU、数量），否则报价单的 fingerprint 对不上，
 * 会返回 {@code PRICE_CHANGED}。
 */
public record CreateOrderRequest(
        @NotNull UUID quoteId,
        @NotNull @Valid Address shipAddress,
        @NotEmpty @Valid List<Line> lines,
        @Size(max = 64) String idempotencyKey) {

    /**
     * 收货地址快照。**必须完整可发**——快照里存脱敏电话，商家就发不了货。
     *
     * <p>脱敏只做在展示层和导出层。
     */
    public record Address(
            @NotBlank @Size(max = 32) String receiverName,
            @NotBlank @Size(max = 20) String phone,
            @NotBlank String provinceCode,
            @NotBlank String cityCode,
            @NotBlank String districtCode,
            @NotBlank @Size(max = 200) String detail) {}

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
