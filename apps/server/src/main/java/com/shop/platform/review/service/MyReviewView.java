package com.shop.platform.review.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

/** 买家自己的评价（订单评价页出参）：一单一评，含逐行评分、追评与卖家回复。 */
@Schema(description = "买家自己的订单评价")
public record MyReviewView(
        @Schema(requiredMode = REQUIRED) java.util.UUID id,
        @Schema(requiredMode = REQUIRED) java.util.UUID orderId,
        @Schema(description = "订单号快照（展示用）") String orderNo,
        @Schema(requiredMode = REQUIRED) java.util.UUID shopId,
        @Schema(requiredMode = REQUIRED) List<RatingLine> items,
        String appendText,
        java.time.OffsetDateTime appendedAt,
        String reply,
        java.time.OffsetDateTime repliedAt,
        @Schema(requiredMode = REQUIRED) java.time.OffsetDateTime createdAt) {

    /**
     * 一条评价行（商品名/图为下单快照，商品改名下架不影响历史展示）。
     *
     * <p>刻意不叫 {@code Item}：order 的结算预览里已经有一个叫 {@code Item} 的下单行（{@code PreviewResponse.Item}），
     * 同名 schema 会被 springdoc 顶掉一个，SDK 侧就变成「某个 Item 少了另一半字段」——查起来极费劲的漂移。
     * 嵌套组件按语义命名（apps/server/AGENTS.md 命名规范）。
     */
    @Schema(description = "评价行")
    public record RatingLine(
            @Schema(requiredMode = REQUIRED) java.util.UUID orderItemId,
            @Schema(requiredMode = REQUIRED) java.util.UUID productId,
            @Schema(requiredMode = REQUIRED) String name,
            String image,
            @Schema(requiredMode = REQUIRED) Integer rating,
            String content,
            List<String> images) {}
}
