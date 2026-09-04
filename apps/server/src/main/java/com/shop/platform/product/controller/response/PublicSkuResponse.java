package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuAttr;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

@Schema(name = "PublicSkuResponse")
public record PublicSkuResponse(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) List<SkuAttr> attributes,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED, nullable = true) Money price,
        @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock) {

    /** 币种取 Sku.currency，缺省回退本平台默认币种 CNY；null 金额不构造成 Money */
    private static Money money(Long fen, String currency) {
        if (fen == null) return null;
        return Money.ofFen(fen, currency != null ? currency : Money.CNY);
    }

    public static PublicSkuResponse from(Sku s, StockView stock) {
        return new PublicSkuResponse(
                s.getId(),
                s.getName(),
                s.getAttributes(),
                s.getImage(),
                money(s.getPrice(), s.getCurrency()),
                money(s.getOriginalPrice(), s.getCurrency()),
                stock == null ? 0 : stock.availableStock());
    }
}
