package com.shop.platform.cms.dto;

import com.shop.platform.cms.mapper.NavGroup;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** 创建/更新首页导航条目的入参（更新时忽略 navKey，不可改）。crud 复用同一形状 */
public record NavRequest(
        @NotBlank @Size(max = CmsFieldRules.KEY_MAX) String navKey,
        @NotBlank @Size(max = CmsFieldRules.TITLE_MAX) String title,
        @Size(max = CmsFieldRules.KEY_MAX) String iconKey,
        @Size(max = CmsFieldRules.TARGET_MAX) String target,
        @Pattern(regexp = LinkTarget.PATTERN, message = "目标类型不支持") String targetType,
        @Valid @Size(max = CmsFieldRules.SUB_GROUPS_MAX) List<NavGroup> subs,
        Integer sortOrder) {}
