package com.shop.platform.recommend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;

/**
 * feed 查询入参。三个字段都可选，都不传即「全站 · 换一批 · {@value #DEFAULT_SIZE} 条」。
 *
 * <p>{@code cursor} 是不透明串（服务端编的 {@code <seed>.<lastId>}）：不传 = 换一批（服务端发新种子从头发），
 * 带了 = 续翻同一批。前端只负责原样带回，不解析、不构造。
 */
public record FeedQuery(
        /** 召回范围：tab 指向的类目 id（含子树）；null = 全站 */
        UUID categoryId,
        /** 上一页 nextCursor 原样带回；null = 第一页 / 换一批 */
        String cursor,
        /** 每页条数，默认 {@value #DEFAULT_SIZE}（六列四行），上限 {@value #SIZE_MAX}（zod 与 @Max 同口径，越界 422） */
        @Min(1) @Max(FeedQuery.SIZE_MAX) Integer size) {

    /** 一屏 feed 的条数：首页是六列四行，这个数同时是骨架屏要画多少个坑 */
    public static final int DEFAULT_SIZE = 24;

    /** 一次最多召回几条：换一批就是换一批，不是把全站拉回浏览器 */
    public static final int SIZE_MAX = 48;

    public FeedQuery {
        size = size == null ? DEFAULT_SIZE : size;
    }
}
