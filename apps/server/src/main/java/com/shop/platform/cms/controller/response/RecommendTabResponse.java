package com.shop.platform.cms.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.model.CmsStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 推荐条出参：管理端与公开端共用。
 * 字段镜像实体现状，前端 RecommendTabDtoSchema 逐字段严格校验，只减不增。
 */
public record RecommendTabResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String target,
        @Schema(requiredMode = REQUIRED, nullable = true) String targetType,
        @Schema(requiredMode = REQUIRED) Boolean isDefault,
        @Schema(requiredMode = REQUIRED) Integer sortOrder,
        @Schema(requiredMode = REQUIRED) CmsStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

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
}
