package com.shop.platform.cms.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cms.mapper.Banner;
import com.shop.platform.cms.model.CmsStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Banner 出参：管理端与公开端共用（CmsContentAdminController / CmsPublicController 返回同一形状）。
 * 因跨 controller 复用，放 controller 包顶层而非内部类——仍满足「Response 后缀只出现在 controller 包」。
 * 字段镜像实体现状，前端 BannerDtoSchema 逐字段严格校验，只减不增。
 */
public record BannerResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String slot,
        @Schema(requiredMode = REQUIRED) String title,
        @Schema(requiredMode = REQUIRED, nullable = true) String subtitle,
        @Schema(requiredMode = REQUIRED) String imageUrl,
        @Schema(requiredMode = REQUIRED, nullable = true) String target,
        @Schema(requiredMode = REQUIRED, nullable = true) String targetType,
        @Schema(requiredMode = REQUIRED, nullable = true) String link,
        @Schema(requiredMode = REQUIRED) Integer sortOrder,
        @Schema(requiredMode = REQUIRED) CmsStatus status,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime startAt,
        @Schema(requiredMode = REQUIRED, nullable = true) OffsetDateTime endAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static BannerResponse from(Banner b) {
        return new BannerResponse(
                b.getId(),
                b.getSlot(),
                b.getTitle(),
                b.getSubtitle(),
                b.getImageUrl(),
                b.getTarget(),
                b.getTargetType(),
                b.getLink(),
                b.getSortOrder(),
                b.getStatus(),
                b.getStartAt(),
                b.getEndAt(),
                b.getCreatedAt(),
                b.getUpdatedAt());
    }

    public static List<BannerResponse> from(List<Banner> list) {
        return list.stream().map(BannerResponse::from).toList();
    }
}
