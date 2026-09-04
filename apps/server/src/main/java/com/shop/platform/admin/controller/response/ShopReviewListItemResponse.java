package com.shop.platform.admin.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.admin.model.ShopReviewStatus;
import com.shop.platform.admin.service.ShopReviewItem;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/** 审核队列项出参：镜像 service 的 ShopReviewItem（含跨 schema 拼装的店名/店主手机号），字段只减不增 */
public record ShopReviewListItemResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) String shopName,
        @Schema(requiredMode = REQUIRED) String ownerPhone,
        @Schema(requiredMode = REQUIRED) ShopReviewStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true)
                /** 拒绝理由：仅 REJECTED 后有值，PENDING 时为空（真实可空，不标 required） */
                String reason,
        @Schema(requiredMode = REQUIRED, nullable = true)
                /** 审核完成时间：PENDING 时为空（真实可空，不标 required） */
                OffsetDateTime decidedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

    public static ShopReviewListItemResponse from(ShopReviewItem item) {
        return new ShopReviewListItemResponse(
                item.id(),
                item.shopId(),
                item.shopName(),
                item.ownerPhone(),
                item.status(),
                item.reason(),
                item.decidedAt(),
                item.createdAt());
    }
}
