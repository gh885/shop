package com.shop.platform.cms.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.OffsetDateTime;

/** 创建/更新运营位 banner 的入参（更新时忽略 slot，不可改）。crud 复用同一形状 */
public record BannerRequest(
        @NotBlank @Size(max = 32) String slot,
        @NotBlank @Size(max = 64) String title,
        @Size(max = 128) String subtitle,
        @NotBlank @Size(max = 512) String imageUrl,
        @Size(max = 255) String target,
        @Pattern(regexp = "PRODUCT|CATEGORY|CAMPAIGN|SEARCH|URL", message = "目标类型不支持") String targetType,
        @Size(max = 512) String link,
        Integer sortOrder,
        OffsetDateTime startAt,
        OffsetDateTime endAt) {}
