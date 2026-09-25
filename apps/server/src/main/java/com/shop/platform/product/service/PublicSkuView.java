package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.model.SkuAttr;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/**
 * 买家侧 SKU（只含在售 SKU）。
 *
 * <p><b>price 刻意不标 nullable</b>：详情只返在售 SKU，而发布/重上（{@code ensurePublishable}）与改 SKU
 * （price 必填）都保证在售 SKU 必有价，所以这里不可能为空。{@code originalPrice} 则是真可空——
 * 「没有划线价」是常态，前端据此决定要不要画那行删除线。
 */
@Schema(name = "PublicSkuResponse")
public record PublicSkuView(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
        @Schema(requiredMode = REQUIRED) List<SkuAttr> attributes,
        @Schema(requiredMode = REQUIRED, nullable = true) String image,
        @Schema(requiredMode = REQUIRED) Money price,
        @Schema(requiredMode = REQUIRED, nullable = true) Money originalPrice,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Integer stock) {

    public static PublicSkuView from(Sku s, StockView stock) {
        return new PublicSkuView(
                s.getId(),
                s.getName(),
                s.getAttributes(),
                s.getImage(),
                s.priceAsMoney(),
                s.originalPriceAsMoney(),
                StockView.availableOrZero(stock));
    }
}
