package com.shop.platform.cms.controller;

import com.shop.platform.cms.mapper.Banner;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Banner 出参：管理端与公开端共用（CmsContentAdminController / CmsPublicController 返回同一形状）。
 * 因跨 controller 复用，放 controller 包顶层而非内部类——仍满足「Response 后缀只出现在 controller 包」。
 * 字段镜像实体现状，前端 BannerDtoSchema 逐字段严格校验，只减不增。
 */
public record BannerResponse(
        UUID id,
        String slot,
        String title,
        String subtitle,
        String imageUrl,
        String target,
        String targetType,
        String link,
        Integer sortOrder,
        Integer status,
        OffsetDateTime startAt,
        OffsetDateTime endAt,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

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
