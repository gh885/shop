package com.shop.platform.review.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;

/** 商品评价聚合（商详评价区顶部）：条数、平均星级、好评率。无评价时各项为 0 而不是 null（REV-12）。 */
@Schema(description = "商品评价聚合")
public record ProductReviewSummary(
        @Schema(requiredMode = REQUIRED) long total,
        @Schema(description = "好评（星级 ≥4）条数", requiredMode = REQUIRED) long goodCount,
        @Schema(description = "好评率，百分比保留一位小数（0~100）", requiredMode = REQUIRED) BigDecimal positiveRate,
        @Schema(description = "平均星级，保留一位小数（0~5）", requiredMode = REQUIRED) BigDecimal averageRating) {}
