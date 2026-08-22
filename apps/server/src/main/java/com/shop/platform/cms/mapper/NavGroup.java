package com.shop.platform.cms.mapper;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 首页导航分组 {name, items[]} — cms.nav_entries.subs 列（JSONB）的元素形状。
 *
 * <p>与前端 NavGroup 同构，HTTP 入参与 DB 读共用。校验注解只在请求边界经 @Valid 触发。
 */
public record NavGroup(@NotBlank @Size(max = 64) String name, List<@Size(max = 64) String> items) {}
