package com.shop.platform.admin.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.admin.infra.StaffContext;
import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.admin.service.ShopReviewService.ShopReviewItem;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
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
    public Page<ShopReviewItem> list(
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") @Min(1) long page,
            @RequestParam(defaultValue = "10") @Min(1) @Max(100) long size) {
        return shopReviewService.pageList(status, page, size);
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

    public record RejectRequest(@NotBlank @Size(max = 255) String reason) {}
}
