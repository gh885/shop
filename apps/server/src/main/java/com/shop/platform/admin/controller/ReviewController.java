package com.shop.platform.admin.controller;

import com.shop.platform.admin.dto.RejectRequest;
import com.shop.platform.admin.infra.StaffContext;
import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.service.ShopReviewItem;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
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

@RestController
@RequestMapping("/admin/reviews")
@Validated
@RequiredArgsConstructor
public class ReviewController {

    private final ShopReviewService shopReviewService;

    /** 审核队列：按 status 筛选分页（PENDING 待审 / APPROVED 已通过 / REJECTED 已拒绝） */
    @GetMapping
    public PageResult<ShopReviewItem> list(
            @Valid PageParams pageParams, @RequestParam(required = false) String status) {
        return shopReviewService.pageList(status, pageParams.page(), pageParams.size());
    }

    /** 审核通过：店铺状态 → ACTIVE */
    @PostMapping("/{id}/approve")
    public ShopReview approve(@PathVariable UUID id) {
        return shopReviewService.approve(id, StaffContext.get());
    }

    /** 审核拒绝：店铺状态 → REJECTED，理由必填留痕 */
    @PostMapping("/{id}/reject")
    public ShopReview reject(@PathVariable UUID id, @Valid @RequestBody RejectRequest req) {
        return shopReviewService.reject(id, StaffContext.get(), req.reason());
    }
}
