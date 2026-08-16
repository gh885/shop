package com.shop.platform.product.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * 买家侧商品列表筛选入参。字段全部可选，都不传即「全站上架商品按新品排序」。
 *
 * <p>没有 status 字段：买家侧只可能看到上架商品，状态由 service 写死，不接受前端指定（否则草稿可被枚举）。
 */
public record ProductQuery(
        UUID categoryId,
        UUID shopId,
        @Size(max = 128) String keyword,
        /** 排序：newest 新品（默认）/ price_asc 价格升 / price_desc 价格降；非法值被 @Pattern 拦成 400 */
        @Pattern(regexp = "newest|price_asc|price_desc", message = "排序方式不支持") String sort) {}
