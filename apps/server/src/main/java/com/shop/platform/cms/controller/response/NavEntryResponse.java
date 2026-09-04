package com.shop.platform.cms.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.cms.mapper.NavEntry;
import com.shop.platform.cms.model.CmsStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 导航出参：管理端与公开端共用。subs 为 JSONB 整段（NavGroup 列表），原样透传。
 * 字段镜像实体现状，前端 NavEntryDtoSchema 逐字段严格校验，只减不增。
 */
public record NavEntryResponse(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String navKey,
        @Schema(requiredMode = REQUIRED) String title,
        @Schema(requiredMode = REQUIRED, nullable = true) String iconKey,
        @Schema(requiredMode = REQUIRED, nullable = true) String target,
        @Schema(requiredMode = REQUIRED, nullable = true) String targetType,
        @Schema(requiredMode = REQUIRED) List<com.shop.platform.cms.mapper.NavGroup> subs,
        @Schema(requiredMode = REQUIRED) Integer sortOrder,
        @Schema(requiredMode = REQUIRED) CmsStatus status,
        @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime updatedAt) {

    public static NavEntryResponse from(NavEntry n) {
        return new NavEntryResponse(
                n.getId(),
                n.getNavKey(),
                n.getTitle(),
                n.getIconKey(),
                n.getTarget(),
                n.getTargetType(),
                n.getSubs(),
                n.getSortOrder(),
                n.getStatus(),
                n.getCreatedAt(),
                n.getUpdatedAt());
    }

    public static List<NavEntryResponse> from(List<NavEntry> list) {
        return list.stream().map(NavEntryResponse::from).toList();
    }
}
