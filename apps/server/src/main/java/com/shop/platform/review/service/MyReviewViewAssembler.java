package com.shop.platform.review.service;

import com.shop.platform.review.mapper.Review;
import com.shop.platform.review.mapper.ReviewItem;
import java.util.List;

/**
 * {@link MyReviewView} 的拼装：提交后回给买家看的那一份与订单评价页读的是同一个形状，
 * 形状只有一处定义（两处各拼一次，两次就会漂）。
 */
final class MyReviewViewAssembler {

    static MyReviewView of(Review review, List<ReviewItem> items, String orderNo) {
        List<MyReviewView.RatingLine> views = items.stream()
                .map(item -> new MyReviewView.RatingLine(
                        item.getOrderItemId(),
                        item.getProductId(),
                        item.getName(),
                        item.getImage(),
                        item.getRating(),
                        item.getContent(),
                        item.getImages() == null ? List.of() : item.getImages()))
                .toList();
        return new MyReviewView(
                review.getId(),
                review.getOrderId(),
                orderNo,
                review.getShopId(),
                views,
                review.getAppendText(),
                review.getAppendedAt(),
                review.getReply(),
                review.getRepliedAt(),
                review.getCreatedAt());
    }

    private MyReviewViewAssembler() {}
}
