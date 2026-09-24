package com.shop.platform.cms.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** 创建/更新推荐词条的入参。crud 复用同一形状 */
public record RecommendTabRequest(
        @NotBlank @Size(max = 32) String name,
        @Size(max = 255) String target,
        @Pattern(regexp = LinkTarget.PATTERN, message = "目标类型不支持") String targetType,
        Boolean isDefault,
        Integer sortOrder) {}
