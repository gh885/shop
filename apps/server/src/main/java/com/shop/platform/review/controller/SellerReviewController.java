package com.shop.platform.review.controller;

import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.review.dto.ReviewDtos.ReplyRequest;
import com.shop.platform.review.dto.ReviewDtos.ReviewPage;
import com.shop.platform.review.dto.ReviewDtos.ReviewView;
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
 * 商家侧评价入口：看店铺评价、回复一次。
 *
 * <p>商家身份从令牌来：店铺范围随凭据传进 service，越权的店折 404。读用
 * {@code review:read}（客服可看），回复用 {@code review:reply}（店主可授予子账号）——
 * 看和写一个爆炸半径，拆两个码。
 */
@RestController
@RequestMapping("/api/seller/reviews")
public class SellerReviewController {

    private static final int MAX_PAGE_SIZE = 100;

    private final ReviewService service;
    private final ReviewQueryService queries;
    private final Authorizer authorizer;

    public SellerReviewController(ReviewService service, ReviewQueryService queries, Authorizer authorizer) {
        this.service = service;
        this.queries = queries;
        this.authorizer = authorizer;
    }

    /**
     * 店铺评价列表。published + hidden 都给：被平台处置的评价，商家要能看见才知道为什么少了。
     * star：1-5 精确筛选；replied：已回复/未回复。
     */
    @GetMapping
    public ReviewPage list(
            @RequestParam UUID shopId,
            @Min(1) @Max(5) @RequestParam(required = false) Integer star,
            @RequestParam(required = false) Boolean replied,
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String cursor) {
        AccessScope.Seller scope = authorizer.seller(Permission.REVIEW_READ);
        return queries.forShop(scope, shopId, star, replied, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 回复一次：CAS 守卫，回复过 / 隐藏中 / 不在本店范围都不落。 */
    @PostMapping("/{id}/reply")
    public ReviewView reply(@PathVariable UUID id, @Valid @RequestBody ReplyRequest request) {
        AccessScope.Seller scope = authorizer.seller(Permission.REVIEW_REPLY);
        return service.reply(id, scope, request.content());
    }
}
