package com.shop.platform.shop.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.mapper.ShopReview;
import com.shop.platform.shop.model.ShopReviewStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 审核记录出参：字段镜像实体现状（admin 端 ShopReviewSchema 严格校验） */
public record ShopReviewResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED, nullable = true) UUID staffId,
        @Schema(requiredMode = REQUIRED) ShopReviewStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) String reason,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime decidedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static ShopReviewResponse from(ShopReview review) {
        return new ShopReviewResponse(
                review.getId(),
                review.getShopId(),
                review.getStaffId(),
                review.getStatus(),
                review.getReason(),
                review.getDecidedAt(),
                review.getCreatedAt(),
                review.getUpdatedAt());
    }
}
