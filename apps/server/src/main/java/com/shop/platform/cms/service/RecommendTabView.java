package com.shop.platform.cms.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cms.mapper.RecommendTab;
import com.shop.platform.cms.model.CmsStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 推荐条出参：管理端与公开端共用（与 {@link BannerView} 同一个理由：service 包形状类，直出即契约）。
 * 字段镜像实体现状：删字段或改类型会让前端生成的 responseValidator（由契约生成，未开 strict）当场拒。
 */
@Schema(name = "RecommendTabResponse")
public record RecommendTabView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        @Schema(requiredMode = REQUIRED, nullable = true) String target,
        @Schema(requiredMode = REQUIRED, nullable = true) String targetType,
        @Schema(requiredMode = REQUIRED) Boolean isDefault,
        @Schema(requiredMode = REQUIRED) Integer sortOrder,
        @Schema(requiredMode = REQUIRED) CmsStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static RecommendTabView from(RecommendTab t) {
        return new RecommendTabView(
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
