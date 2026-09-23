package com.shop.platform.shop.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.shop.model.ShopReviewStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 审核队列项：含跨 schema 拼装的店名/店主手机号（号码只给掩码）。
 *
 * <p>本 record 即 HTTP 出参（无独立 Response 镜像）：字段只减不增，改动等于改接口。
 */
public record ShopReviewItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) String shopName,
        /** 掩码形态（前 3 后 4）：队列是批量出口，明文只经 {@code POST /admin/reviews/{id}/owner-phone} 逐条索取并留痕 */
        @Schema(
                        requiredMode = REQUIRED,
                        description = "店主手机号，掩码（前 3 后 4）；明文需 POST /admin/reviews/{id}/owner-phone 逐条索取")
                String ownerPhone,
        @Schema(requiredMode = REQUIRED) ShopReviewStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true)
                /** 拒绝理由：仅 REJECTED 后有值，PENDING 时为空（真实可空，不标 required） */
                String reason,
        @Schema(requiredMode = REQUIRED, nullable = true)
                /** 审核完成时间：PENDING 时为空（真实可空，不标 required） */
                OffsetDateTime decidedAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {}
