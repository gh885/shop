package com.shop.platform.admin.controller;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.admin.dto.RejectRequest;
import com.shop.platform.admin.infra.StaffContext;
import com.shop.platform.admin.mapper.ShopReview;
import com.shop.platform.admin.model.ShopReviewStatus;
import com.shop.platform.admin.service.ShopReviewItem;
import com.shop.platform.admin.service.ShopReviewService;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
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

    /** 审核队列项出参：镜像 service 的 ShopReviewItem（含跨 schema 拼装的店名/店主手机号），字段只减不增 */
    public record ShopReviewListItemResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) UUID shopId,
            @Schema(requiredMode = REQUIRED) String shopName,
            @Schema(requiredMode = REQUIRED) String ownerPhone,
            @Schema(requiredMode = REQUIRED) ShopReviewStatus status,
            /** 拒绝理由：仅 REJECTED 后有值，PENDING 时为空（真实可空，不标 required） */
            String reason,
            /** 审核完成时间：PENDING 时为空（真实可空，不标 required） */
            OffsetDateTime decidedAt,
            @Schema(requiredMode = REQUIRED) OffsetDateTime createdAt) {

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
            ShopReviewStatus status,
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
