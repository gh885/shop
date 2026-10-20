package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.mapper.StandardProduct;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;

/**
 * 卖家挂靠时看到的候选（只有 ACTIVE 标准品，不吐状态与合并去向）。
 *
 * <p>为什么不复用 {@link StandardProductView}：卖家不该看到「合并」这一层治理细节——那是平台的纠错手段，
 * 不是他需要理解的概念。出参只留「选哪个」需要的四列。
 */
@Schema(name = "StandardProductCandidateResponse")
public record StandardProductCandidateView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String brand,
        @Schema(requiredMode = REQUIRED, nullable = true) String barcode) {

    public static StandardProductCandidateView from(StandardProduct s) {
        return new StandardProductCandidateView(s.getId(), s.getName(), s.getBrand(), s.getBarcode());
    }
}
