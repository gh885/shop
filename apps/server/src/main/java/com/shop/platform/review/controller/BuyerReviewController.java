package com.shop.platform.review.controller;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PagingRules;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.Public;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.review.dto.ReviewDtos.AppendReviewRequest;
import com.shop.platform.review.dto.ReviewDtos.ReviewPage;
import com.shop.platform.review.dto.ReviewDtos.ReviewView;
import com.shop.platform.review.dto.ReviewDtos.SpuReviewSection;
import com.shop.platform.review.dto.ReviewDtos.SubmitReviewRequest;
import com.shop.platform.review.service.ReviewQueryService;
import com.shop.platform.review.service.ReviewService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家侧评价入口：待评价、我的评价、提交、追评；外加商品详情的公开评价区。
 *
 * <p>不判权限点：买家没有权限体系，边界是「这条评价是不是我的」——reviewId 一律配 buyer_id
 * 在 SQL 里核，别人的评价查出空折 404。公开评价区对匿名开放（商品详情页是分享首屏），
 * 只出 published，昵称服务端脱敏。
 */
@RestController
@RequestMapping("/api/buyer/reviews")
public class BuyerReviewController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final int SECTION_RATE_LIMIT = 120;
    private static final Duration SECTION_RATE_WINDOW = Duration.ofMinutes(1);

    private final ReviewService service;
    private final ReviewQueryService queries;
    private final Authorizer authorizer;
    private final RateLimiter rateLimiter;

    public BuyerReviewController(
            ReviewService service, ReviewQueryService queries, Authorizer authorizer, RateLimiter rateLimiter) {
        this.service = service;
        this.queries = queries;
        this.authorizer = authorizer;
        this.rateLimiter = rateLimiter;
    }

    /** 待评价列表：事件预生成的行，带下单快照（标题/图/规格），买家照着挑着评。 */
    @GetMapping("/pending")
    public ReviewPage pending(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String cursor) {
        UUID buyerId = authorizer.current().operatorId();
        return queries.pending(buyerId, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 我的评价（含被平台隐藏的——自己写的东西自己要看得见）。 */
    @GetMapping("/mine")
    public ReviewPage mine(
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "20") int limit,
            @RequestParam(required = false) String cursor) {
        UUID buyerId = authorizer.current().operatorId();
        return queries.mine(buyerId, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE));
    }

    /** 待评价计数：买家首页卡片。 */
    @GetMapping("/pending/count")
    public long pendingCount() {
        UUID buyerId = authorizer.current().operatorId();
        return queries.pendingCount(buyerId);
    }

    /** 提交评价：一行一评，窗口 15 天，全额退款行不可评。 */
    @PostMapping("/{id}")
    public ReviewView publish(@PathVariable UUID id, @Valid @RequestBody SubmitReviewRequest request) {
        UUID buyerId = authorizer.current().operatorId();
        return service.publish(id, buyerId, request);
    }

    /** 追评一次：发布后 90 天内。 */
    @PostMapping("/{id}/append")
    public ReviewView append(@PathVariable UUID id, @Valid @RequestBody AppendReviewRequest request) {
        UUID buyerId = authorizer.current().operatorId();
        return service.append(id, buyerId, request);
    }

    /**
     * 商品详情评价区（匿名开放）：统计头 + 列表，一次拿全。filter：all / with_image / good / mid / bad。
     *
     * <p>限流键有身份用身份，没有落 anonymous——评价区是商品页的常驻区块，不能不限流。
     */
    @Public
    @GetMapping(params = "spuId")
    public ResponseEntity<SpuReviewSection> publicSection(
            @RequestParam UUID spuId,
            @RequestParam(defaultValue = "all") String filter,
            @Min(1) @Max(PagingRules.MAX_LIMIT) @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String cursor) {
        UUID buyerId = Optional.ofNullable(authorizer.currentOrNull())
                .map(CurrentOperator::operatorId)
                .orElse(null);
        String rateKey = "rl:review-section:" + (buyerId != null ? buyerId : "anonymous");
        if (rateLimiter.exceeded(rateKey, SECTION_RATE_LIMIT, SECTION_RATE_WINDOW)) {
            throw BusinessException.rateLimited("请求太频繁，请稍后再试");
        }
        return ResponseEntity.ok(queries.publicSection(spuId, filter, cursor, Math.clamp(limit, 1, MAX_PAGE_SIZE)));
    }
}
