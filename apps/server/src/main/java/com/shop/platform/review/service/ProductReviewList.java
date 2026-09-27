package com.shop.platform.review.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.PageResult;
import io.swagger.v3.oas.annotations.media.Schema;

/** 商详评价区出参：聚合 + 分页列表。两者刻意不合成一个 PageResult（聚合按全量算，见 REV-14）。 */
@Schema(description = "商品评价区（聚合 + 列表）")
public record ProductReviewList(
        @Schema(requiredMode = REQUIRED) ProductReviewSummary summary,
        @Schema(requiredMode = REQUIRED) PageResult<ProductReviewItem> page) {}
