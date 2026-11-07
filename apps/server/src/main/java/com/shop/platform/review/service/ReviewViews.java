package com.shop.platform.review.service;

import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.review.dto.ReviewDtos.ReviewView;
import com.shop.platform.review.mapper.ReviewRow;

/** 行投影 → HTTP 视图。脱敏只在这里发生：昵称留首字，其余打星。 */
final class ReviewViews {

    private ReviewViews() {}

    static ReviewView toView(ReviewRow row, boolean maskName) {
        String displayName;
        if (row.anonymous()) {
            displayName = null;
        } else if (maskName) {
            displayName = mask(row.buyerName());
        } else {
            displayName = row.buyerName();
        }
        return new ReviewView(
                row.id(),
                row.sellerOrderId(),
                row.lineNo(),
                row.spuId(),
                row.title(),
                row.imageUrl(),
                row.specValues(),
                row.status(),
                row.overall(),
                row.descScore(),
                row.serviceScore(),
                row.logisticsScore(),
                row.content(),
                JsonColumns.readStringList(row.imagesJson()),
                row.content2(),
                JsonColumns.readStringList(row.images2Json()),
                row.appendedAt(),
                row.replyContent(),
                row.replyAt(),
                row.anonymous(),
                displayName,
                row.reviewableUntil(),
                row.reviewedAt(),
                row.createdAt());
    }

    /** 淘宝口径：留第一个字符，其余换 **。空名字退成「买家」。 */
    static String mask(String name) {
        if (name == null || name.isBlank()) {
            return "买家";
        }
        int first = name.codePointAt(0);
        return new String(Character.toChars(first)) + "**";
    }
}
