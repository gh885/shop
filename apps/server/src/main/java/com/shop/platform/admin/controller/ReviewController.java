package com.shop.platform.admin.controller;

import com.shop.platform.admin.controller.response.ShopReviewListItemResponse;
import com.shop.platform.admin.controller.response.ShopReviewResponse;
import com.shop.platform.admin.dto.RejectRequest;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.common.StaffContext;
import com.shop.platform.infra.security.authz.RequirePermission;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "admin-reviews", description = "平台店铺审核")
@RestController
@RequestMapping("/admin/reviews")
@Validated
@RequiredArgsConstructor
@RequirePermission(Permissions.SHOP_REVIEW)
public class ReviewController {

    private final ShopReviewService shopReviewService;

    /** 审核队列：按 status 筛选分页（PENDING 待审 / APPROVED 已通过 / REJECTED 已拒绝） */
    @GetMapping
    public PageResult<ShopReviewListItemResponse> listShopReviews(
            @Valid PageParams pageParams, @RequestParam(required = false) String status) {
        return shopReviewService.pageList(pageParams, status).map(ShopReviewListItemResponse::from);
    }

    /** 审核通过：店铺状态 → ACTIVE */
    @PostMapping("/{id}/approve")
    public ShopReviewResponse approveShopReview(@PathVariable UUID id) {
        return ShopReviewResponse.from(shopReviewService.approve(id, StaffContext.get()));
    }

    /** 审核拒绝：店铺状态 → REJECTED，理由必填留痕 */
    @PostMapping("/{id}/reject")
    public ShopReviewResponse rejectShopReview(@PathVariable UUID id, @Valid @RequestBody RejectRequest req) {
        return ShopReviewResponse.from(shopReviewService.reject(id, StaffContext.get(), req.reason()));
    }
}
