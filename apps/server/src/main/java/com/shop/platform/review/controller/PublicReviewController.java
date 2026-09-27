package com.shop.platform.review.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.review.service.ProductReviewList;
import com.shop.platform.review.service.ReviewQueryService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商品评价公开读（商详页评价区，匿名可访问）。
 *
 * <p>匿名是刻意的：评价是商详页的一部分，没登录的人也要看得到口碑，否则商详对未登录用户少一半信任信号。
 * 出参里买家昵称恒为掩码（REV-15），没有「点开看买家」的动作。
 */
@Tag(name = "public-reviews", description = "商品评价公开读（商详评价区）")
@RestController
@RequestMapping("/api/reviews")
@RequiredArgsConstructor
@Validated
public class PublicReviewController {

    private final ReviewQueryService reviewQueryService;

    /** GET /api/reviews/products/{productId} —— 聚合（全量口径）+ 评分行分页列表 */
    @GetMapping("/products/{productId}")
    public ProductReviewList listProductReviews(@Valid PageParams pageParams, @PathVariable UUID productId) {
        return reviewQueryService.listProductReviews(productId, pageParams);
    }
}
