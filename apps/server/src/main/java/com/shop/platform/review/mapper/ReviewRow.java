package com.shop.platform.review.mapper;

import java.time.Instant;
import java.util.UUID;

/**
 * {@code review.review} 的行投影。图片列是 jsonb 数组，SQL 里 CAST 成 text 原文
 * （{@code imagesJson} / {@code images2Json}），转列表交给 {@code JsonColumns.readStringList}。
 */
public record ReviewRow(
        UUID id,
        UUID orderGroupId,
        UUID sellerOrderId,
        UUID orderLineId,
        int lineNo,
        UUID buyerId,
        String buyerName,
        UUID merchantId,
        UUID shopId,
        UUID spuId,
        UUID skuId,
        String title,
        String imageUrl,
        String specValues,
        String status,
        Integer overall,
        Integer descScore,
        Integer serviceScore,
        Integer logisticsScore,
        String content,
        String imagesJson,
        boolean anonymous,
        String content2,
        String images2Json,
        Instant appendedAt,
        String replyContent,
        Instant replyAt,
        Instant reviewableUntil,
        Instant reviewedAt,
        Instant createdAt) {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_PUBLISHED = "published";
    public static final String STATUS_HIDDEN = "hidden";
}
