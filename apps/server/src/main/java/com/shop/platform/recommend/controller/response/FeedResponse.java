package com.shop.platform.recommend.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * feed 一页出参：{@code { items, nextCursor }}。
 *
 * <p>不回 total、不做 count（决策二）：列表接口的 PageResult 需要 total 与确定排序，feed 需要的是
 * 游标与随机批次，两者塞进一个端点只会让 PageResult 长出可空的 nextCursor。
 *
 * <p>nextCursor 末页为 null，所以标 {@code nullable = true}（真会发 null 的字段才标）。
 */
@Schema(name = "FeedResponse")
public record FeedResponse(
        @Schema(requiredMode = REQUIRED) List<FeedItemResponse> items,
        @Nullable @Schema(requiredMode = REQUIRED, nullable = true) String nextCursor) {}
