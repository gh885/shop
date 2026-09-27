package com.shop.platform.review.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.review.dto.ReplyReviewRequest;
import com.shop.platform.review.service.ProductReviewItem;
import com.shop.platform.review.service.ReviewQueryService;
import com.shop.platform.review.service.ReviewService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家回复评价（授权 ORDER_FULFILL —— 回复与处理买家反馈是同一件事）。
 *
 * <p>店铺上下文来自 X-Shop-Id，前端不传店 ID；回复别店的评价在 service 层按 shop_id 判，一律 404。
 */
@Tag(name = "seller-reviews", description = "卖家回复评价")
@RestController
@RequestMapping("/seller/reviews")
@RequiredArgsConstructor
@Validated
@RequirePermission(Permissions.ORDER_FULFILL)
public class SellerReviewController {

    private final ReviewQueryService reviewQueryService;
    private final ReviewService reviewService;

    /** GET /seller/reviews —— 本店评价列表（最新在前），每行的「回复」入口在页面上 */
    @GetMapping
    public PageResult<ProductReviewItem> listMyShopReviews(@CurrentShop UUID shopId, @Valid PageParams pageParams) {
        return reviewQueryService.pageShopReviews(shopId, pageParams);
    }

    /** PUT /seller/reviews/{id}/reply —— 回复一次，不可再改（REV-10） */
    @PutMapping("/{id}/reply")
    public void replyReview(
            @CurrentShop UUID shopId,
            @CurrentUser UUID operatorId,
            @PathVariable UUID id,
            @Valid @RequestBody ReplyReviewRequest req) {
        reviewService.reply(id, shopId, operatorId, req);
    }
}
