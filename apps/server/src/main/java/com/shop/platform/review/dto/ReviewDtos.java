package com.shop.platform.review.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** 评价的 HTTP 入参与出参形状。买家昵称在服务端脱敏后放 {@code displayName}，匿名行为 {@code null}。 */
public final class ReviewDtos {

    /**
     * @param overall 总体 1-5 星，必填
     * @param descScore / serviceScore / logisticsScore 描述相符 / 商家服务 / 物流服务，可空
     * @param content 评价正文，可空但整体不能全空由前端保证；500 字封顶由 {@code @Size} 与 DB CHECK 双拦
     * @param images 图片 media key，0-9 张
     * @param anonymous 匿名发布；匿名行公开面不显示昵称
     */
    public record SubmitReviewRequest(
            @NotNull @Min(1) @Max(5) Integer overall,
            @Min(1) @Max(5) Integer descScore,
            @Min(1) @Max(5) Integer serviceScore,
            @Min(1) @Max(5) Integer logisticsScore,
            @Size(max = 500) String content,
            @Size(max = 9) List<String> images,
            boolean anonymous) {}

    public record AppendReviewRequest(@Size(max = 500) String content, @Size(max = 9) List<String> images) {}

    public record ReplyRequest(@NotNull @Size(max = 500) String content) {}

    public record HideRequest(String reason) {}

    /**
     * @param specValues 规格快照原文（jsonb 字符串），前端解析后展示「买的是哪个规格」
     * @param displayName 脱敏后的买家昵称；匿名行为 {@code null}（前端渲染「匿名」）
     */
    public record ReviewView(
            UUID id,
            UUID sellerOrderId,
            int lineNo,
            UUID spuId,
            String title,
            @Schema(nullable = true) String imageUrl,
            @Schema(nullable = true) String specValues,
            String status,
            /** pending 行没有评分，可空由契约声明——否则 zod 校验当场炸 */
            @Schema(nullable = true) Integer overall,
            @Schema(nullable = true) Integer descScore,
            @Schema(nullable = true) Integer serviceScore,
            @Schema(nullable = true) Integer logisticsScore,
            @Schema(nullable = true) String content,
            List<String> images,
            @Schema(nullable = true) String content2,
            List<String> images2,
            @Schema(nullable = true) Instant appendedAt,
            @Schema(nullable = true) String replyContent,
            @Schema(nullable = true) Instant replyAt,
            boolean anonymous,
            /** 匿名行为 null，前端渲染「匿名」 */
            @Schema(nullable = true) String displayName,
            Instant reviewableUntil,
            @Schema(nullable = true) Instant reviewedAt,
            Instant createdAt) {}

    /** 游标分页：{@code nextCursor} 原样传回翻下一页，null 是最后一页。 */
    public record ReviewPage(List<ReviewView> items, @Schema(nullable = true) String nextCursor) {}

    /** 商品详情评价区的头：单 SPU 聚合，实时算。均分为百分位整数（450 = 4.5）。 */
    public record SpuReviewSummary(
            long total, int avgScore, long goodCount, long midCount, long badCount, long withImageCount) {}

    /** 评价区一次拿全：统计头 + 第一页列表。 */
    public record SpuReviewSection(
            SpuReviewSummary stats, List<ReviewView> items, @Schema(nullable = true) String nextCursor) {}
}
