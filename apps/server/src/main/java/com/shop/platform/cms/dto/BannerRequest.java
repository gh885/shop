package com.shop.platform.cms.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/** 创建/更新运营位 banner 的入参（更新时忽略 slot，不可改）。crud 复用同一形状 */
public record BannerRequest(
        @NotBlank @Size(max = CmsFieldRules.KEY_MAX) String slot,
        @NotBlank @Size(max = CmsFieldRules.TITLE_MAX) String title,
        @Size(max = CmsFieldRules.SUBTITLE_MAX) String subtitle,
        @NotBlank @Size(max = CmsFieldRules.URL_MAX) String imageUrl,
        @Size(max = CmsFieldRules.TARGET_MAX) String target,
        @Pattern(regexp = LinkTarget.PATTERN, message = "目标类型不支持") String targetType,
        @Size(max = CmsFieldRules.URL_MAX) String link,
        Integer sortOrder,
        OffsetDateTime startAt,
        OffsetDateTime endAt) {}
