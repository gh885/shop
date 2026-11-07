package com.shop.platform.review.controller;

import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.review.dto.ReviewDtos.HideRequest;
import com.shop.platform.review.dto.ReviewDtos.ReviewPage;
import com.shop.platform.review.service.ReviewQueryService;
import com.shop.platform.review.service.ReviewService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台侧评价治理：全量列表、隐藏、恢复。
 *
 * <p>没有「删除」——评价是对交易事实的记录，平台只下架不销毁；恢复端点让误处置可逆。
 * 隐藏理由进审计不进行：理由是处置依据，跟着审计记录走。
 */
@RestController
@RequestMapping("/api/admin/reviews")
public class AdminReviewController {

    private static final int MAX_PAGE_SIZE = 100;

    private final ReviewService service;
    private final ReviewQueryService queries;
    private final Authorizer authorizer;

    public AdminReviewController(ReviewService service, ReviewQueryService queries, Authorizer authorizer) {
        this.service = service;
        this.queries = queries;
        this.authorizer = authorizer;
    }

    /** 全量评价列表，status 筛 pending / published / hidden。 */
    @GetMapping
    public ReviewPage list(
            @RequestParam(required = false) String status,
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String cursor) {
        authorizer.platform(Permission.REVIEW_MODERATE);
        return queries.forAdmin(status, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 隐藏违规评价。pending 行无可隐藏（还没公开）。 */
    @PostMapping("/{id}/hide")
    public void hide(@PathVariable UUID id, @Valid @RequestBody(required = false) HideRequest request) {
        AccessScope.Platform scope = authorizer.platform(Permission.REVIEW_MODERATE);
        service.hide(id, scope, request == null ? null : request.reason());
    }

    /** 恢复已隐藏评价。 */
    @PostMapping("/{id}/restore")
    public void restore(@PathVariable UUID id) {
        AccessScope.Platform scope = authorizer.platform(Permission.REVIEW_MODERATE);
        service.restore(id, scope);
    }
}
