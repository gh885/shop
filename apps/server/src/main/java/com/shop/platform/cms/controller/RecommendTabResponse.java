package com.shop.platform.cms.controller;

import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.model.CmsStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 推荐条出参：管理端与公开端共用。
 * 字段镜像实体现状，前端 RecommendTabDtoSchema 逐字段严格校验，只减不增。
 */
public record RecommendTabResponse(
        UUID id,
        String name,
        String target,
        String targetType,
        Boolean isDefault,
        Integer sortOrder,
        CmsStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt) {

    public static RecommendTabResponse from(RecommendTab t) {
        return new RecommendTabResponse(
                t.getId(),
                t.getName(),
                t.getTarget(),
                t.getTargetType(),
                t.getIsDefault(),
                t.getSortOrder(),
                t.getStatus(),
                t.getCreatedAt(),
                t.getUpdatedAt());
    }

    public static List<RecommendTabResponse> from(List<RecommendTab> list) {
        return list.stream().map(RecommendTabResponse::from).toList();
    }
}
