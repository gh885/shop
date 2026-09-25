package com.shop.platform.shop.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentStaff;
import com.shop.platform.shop.controller.response.PhoneRevealResponse;
import com.shop.platform.shop.dto.RejectRequest;
import com.shop.platform.shop.service.ShopReviewItem;
import com.shop.platform.shop.service.ShopReviewService;
import com.shop.platform.shop.service.ShopReviewView;
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

    /** 审核队列：按 status 筛选分页（PENDING 待审 / APPROVED 已通过 / REJECTED 已拒绝），店主手机号只给掩码 */
    @GetMapping
    public PageResult<ShopReviewItem> listShopReviews(
            @Valid PageParams pageParams, @RequestParam(required = false) String status) {
        return shopReviewService.pageList(pageParams, status);
    }

    /**
     * 查看店主电话明文：队列是批量出口，号码恒为掩码，真要打电话核实资质的场景走这一跳，
     * 逐条索取且每次留痕（做成动作端点而不是把明文塞回队列，是为了让「看号码」在契约上就是一个动作）。
     */
    @PostMapping("/{id}/owner-phone")
    public PhoneRevealResponse revealOwnerPhone(@CurrentStaff UUID staffId, @PathVariable UUID id) {
        return new PhoneRevealResponse(shopReviewService.ownerPhone(id, staffId));
    }

    /** 审核通过：店铺状态 → ACTIVE */
    @PostMapping("/{id}/approve")
    public ShopReviewView approveShopReview(@CurrentStaff UUID staffId, @PathVariable UUID id) {
        return ShopReviewView.from(shopReviewService.approve(id, staffId));
    }

    /** 审核拒绝：店铺状态 → REJECTED，理由必填留痕 */
    @PostMapping("/{id}/reject")
    public ShopReviewView rejectShopReview(
            @CurrentStaff UUID staffId, @PathVariable UUID id, @Valid @RequestBody RejectRequest req) {
        return ShopReviewView.from(shopReviewService.reject(id, staffId, req.reason()));
    }
}
