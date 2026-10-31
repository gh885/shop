package com.shop.platform.pricing.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.List;
import java.util.UUID;

/**
 * 结算页算价入参。
 *
 * <p><b>不传价格、不传商家</b>——单价和商家都由 catalog 的 listing 决定。让前端传价格，
 * 等于允许有人编一个价格去下单；让前端传商家，等于允许把别人的货算进自己的单。
 *
 * <p>{@code lineNo} 由前端给：它是分摊矩阵和 {@code order_line} 的并列键，
 * 后端重新编号会让 {@code order_line_discount} 对不上行。
 */
public record QuoteRequest(@Valid Address address, @NotEmpty @Valid List<Line> lines) {

    /** 只到区县级：运费模板按区县匹配，算价不需要门牌号。 */
    public record Address(String provinceCode, String cityCode, String districtCode) {}

    /**
     * 一行。
     *
     * <p>{@code listingId} 是可选的校验位：给了就必须与 catalog 一致，用来挡住
     * "用户看到的商品已经被换商家挂售"。不给也能算。
     */
    @Schema(name = "QuoteLine")
    public record Line(
            @NotNull @Min(1) Integer lineNo,
            @NotNull UUID skuId,
            UUID listingId,
            /** 结算页从购物车带过来的冗余位：算价以 listing 归属为准，这里只接住不采信 */
            UUID merchantId,
            @Positive Integer quantity) {}
}
