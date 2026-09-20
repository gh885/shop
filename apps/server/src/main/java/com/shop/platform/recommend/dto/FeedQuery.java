package com.shop.platform.recommend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;

/**
 * feed 查询入参。三个字段都可选，都不传即「全站 · 换一批 · 24 条」。
 *
 * <p>{@code cursor} 是不透明串（服务端编的 {@code <seed>.<lastId>}）：不传 = 换一批（服务端发新种子从头发），
 * 带了 = 续翻同一批。前端只负责原样带回，不解析、不构造。
 */
public record FeedQuery(
        /** 召回范围：tab 指向的类目 id（含子树）；null = 全站 */
        UUID categoryId,
        /** 上一页 nextCursor 原样带回；null = 第一页 / 换一批 */
        String cursor,
        /** 每页条数，默认 24（六列四行），上限 48（zod 与 @Max 同口径，越界 422） */
        @Min(1) @Max(48) Integer size) {

    public FeedQuery {
        size = size == null ? 24 : size;
    }
}
