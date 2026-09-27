package com.shop.platform.review.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.UUID;

/** 商详评价区的一行（公共出口）：买家昵称恒为掩码（REV-15），追评与卖家回复挂在行上。 */
@Schema(description = "商品评价行")
public record ProductReviewItem(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(description = "所属评价 id（同一单的多行共享它）") UUID reviewId,
        @Schema(requiredMode = REQUIRED) String name,
        String image,
        @Schema(requiredMode = REQUIRED) Integer rating,
        String content,
        List<String> images,
        @Schema(description = "买家追评（一次）") String appendText,
        java.time.OffsetDateTime appendedAt,
        @Schema(description = "卖家回复（一次）") String reply,
        java.time.OffsetDateTime repliedAt,
        @Schema(description = "买家昵称掩码（前 2 后 2）", requiredMode = REQUIRED) String buyer,
        @Schema(requiredMode = REQUIRED) java.time.OffsetDateTime createdAt) {}
