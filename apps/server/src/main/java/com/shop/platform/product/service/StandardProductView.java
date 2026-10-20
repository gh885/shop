package com.shop.platform.product.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.product.mapper.StandardProduct;
import com.shop.platform.product.model.StandardProductStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 平台标准品出参（管理端 CRUD 回显）。卖家侧候选见 {@link StandardProductCandidateView}。 */
@Schema(name = "StandardProductResponse")
public record StandardProductView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID categoryId,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String brand,
        @Schema(requiredMode = REQUIRED, nullable = true) String barcode,
        @Schema(requiredMode = REQUIRED) StandardProductStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) UUID mergedInto,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static StandardProductView from(StandardProduct s) {
        return new StandardProductView(
                s.getId(),
                s.getCategoryId(),
                s.getName(),
                s.getBrand(),
                s.getBarcode(),
                s.getStatus(),
                s.getMergedInto(),
                s.getCreatedAt(),
                s.getUpdatedAt());
    }
}
