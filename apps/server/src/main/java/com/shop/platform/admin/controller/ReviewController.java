package com.shop.platform.admin.controller;

import com.shop.platform.admin.dto.RejectRequest;
import com.shop.platform.admin.infra.StaffContext;
import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.service.ShopReviewItem;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
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
    public PageResult<ShopReviewListItemResponse> list(
            @Valid PageParams pageParams, @RequestParam(required = false) String status) {
        PageResult<ShopReviewItem> page = shopReviewService.pageList(pageParams, status);
        return new PageResult<>(
                page.records().stream().map(ShopReviewListItemResponse::from).toList(), page.total());
    }

    /** 审核通过：店铺状态 → ACTIVE */
    @PostMapping("/{id}/approve")
    public ShopReviewResponse approve(@PathVariable UUID id) {
        return ShopReviewResponse.from(shopReviewService.approve(id, StaffContext.get()));
    }

    /** 审核拒绝：店铺状态 → REJECTED，理由必填留痕 */
    @PostMapping("/{id}/reject")
    public ShopReviewResponse reject(@PathVariable UUID id, @Valid @RequestBody RejectRequest req) {
        return ShopReviewResponse.from(shopReviewService.reject(id, StaffContext.get(), req.reason()));
    }

    /** 审核队列项出参：镜像 service 的 ShopReviewItem（含跨 schema 拼装的店名/店主手机号），字段只减不增 */
    public record ShopReviewListItemResponse(
            UUID id,
            UUID shopId,
            String shopName,
            String ownerPhone,
            String status,
            String reason,
            OffsetDateTime decidedAt,
            OffsetDateTime createdAt) {

        static ShopReviewListItemResponse from(ShopReviewItem item) {
            return new ShopReviewListItemResponse(
                    item.id(),
                    item.shopId(),
                    item.shopName(),
                    item.ownerPhone(),
                    item.status(),
                    item.reason(),
                    item.decidedAt(),
                    item.createdAt());
        }
    }

    /** 审核记录出参：字段镜像实体现状（admin 端 ShopReviewSchema 严格校验） */
    public record ShopReviewResponse(
            UUID id,
            UUID shopId,
            UUID staffId,
            String status,
            String reason,
            OffsetDateTime decidedAt,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        static ShopReviewResponse from(ShopReview review) {
            return new ShopReviewResponse(
                    review.getId(),
                    review.getShopId(),
                    review.getStaffId(),
                    review.getStatus(),
                    review.getReason(),
                    review.getDecidedAt(),
                    review.getCreatedAt(),
                    review.getUpdatedAt());
        }
    }
}
