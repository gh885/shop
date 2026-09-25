package com.shop.platform.cms.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.shop.platform.cms.dto.CmsFieldRules;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 首页导航分组 {name, items[]} — cms.nav_entries.subs 列（JSONB）的元素形状。
 *
 * <p>与前端 NavGroup 同构，HTTP 入参与 DB 读共用。校验注解只在请求边界经 @Valid 触发。
 *
 * <p>「这组没有词条」在契约里表达为**缺省**（zod 侧 items 是 optional，null 会被响应校验判死），所以出参不带 null：
 * JSONB 整段由运营自由配，DB 里存 {"name":"…"} 完全合法，缺的 components 若按默认发成 null，首页导航整块就读不到了。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavGroup(
        @NotBlank @Size(max = CmsFieldRules.TITLE_MAX) String name,
        List<@Size(max = CmsFieldRules.TITLE_MAX) String> items) {}
