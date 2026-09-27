package com.shop.platform.review.controller;

import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.review.dto.AppendReviewRequest;
import com.shop.platform.review.dto.CreateReviewRequest;
import com.shop.platform.review.service.MyReviewView;
import com.shop.platform.review.service.ReviewQueryService;
import com.shop.platform.review.service.ReviewService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家评价（提交 / 查我的 / 追评）。规则见 docs/business-rules/review.md。
 *
 * <p>提交成功回 201 并直接给出这一单的评价视图：提交后买家立刻要看它长什么样，
 * 再发一次 GET 是纯粹的多余一次往返。
 */
@Tag(name = "reviews", description = "买家评价（提交/查询/追评）")
@RestController
@RequestMapping("/reviews")
@RequiredArgsConstructor
public class MyReviewController {

    private final ReviewService reviewService;
    private final ReviewQueryService reviewQueryService;

    /** POST /reviews/orders/{orderId} —— 提交整单评价（逐商品行打分） */
    @PostMapping("/orders/{orderId}")
    @ResponseStatus(HttpStatus.CREATED)
    public MyReviewView submitOrderReview(
            @CurrentUser UUID userId, @PathVariable UUID orderId, @Valid @RequestBody CreateReviewRequest req) {
        return reviewService.submit(orderId, userId, req);
    }

    /** GET /reviews/orders/{orderId} —— 我对这一单的评价；未评价过 404（前端据此给「去评价」入口） */
    @GetMapping("/orders/{orderId}")
    public MyReviewView getOrderReview(@CurrentUser UUID userId, @PathVariable UUID orderId) {
        return reviewQueryService.myOrderReview(orderId, userId);
    }

    /** POST /reviews/{id}/append —— 追评（一次，RPC 风格动作 200） */
    @PostMapping("/{id}/append")
    public void appendReview(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody AppendReviewRequest req) {
        reviewService.append(id, userId, req);
    }
}
