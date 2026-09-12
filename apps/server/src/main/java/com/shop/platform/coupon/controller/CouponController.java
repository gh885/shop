package com.shop.platform.coupon.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.coupon.controller.response.MyCouponResponse;
import com.shop.platform.coupon.dto.MyCouponQuery;
import com.shop.platform.coupon.service.CouponClaimService;
import com.shop.platform.coupon.service.CouponWalletService;
import com.shop.platform.infra.web.CurrentUser;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家优惠券：我的券包与领券。全部接口要求登录（不在 JwtAuthFilter skipPaths 内，未登录 401）。
 *
 * <p>店铺可领券列表在 {@link CouponPublicController}（匿名，挂在 /api/shops 下）——浏览和持有是两件事，
 * 前者不该强制登录。
 */
@Tag(name = "coupons", description = "买家优惠券（券包 / 领券）")
@RestController
@RequestMapping("/coupons")
@RequiredArgsConstructor
public class CouponController {

    private final CouponWalletService couponWalletService;

    private final CouponClaimService couponClaimService;

    /** 我的券包分页：status 对应「未使用/已使用/已过期」页签，每行带店名与展示状态 */
    @GetMapping("/mine")
    public PageResult<MyCouponResponse> listMyCoupons(
            @CurrentUser UUID userId, @Valid PageParams pageParams, @Valid MyCouponQuery query) {
        return couponWalletService.pageMine(userId, query.status(), pageParams).map(MyCouponResponse::from);
    }

    /** 领券：每人每张券限领一次，领完 / 已停用 / 不在可领时间内分别是 409 / 400 */
    @PostMapping("/{templateId}/claim")
    @ResponseStatus(HttpStatus.CREATED)
    public MyCouponResponse claimCoupon(@CurrentUser UUID userId, @PathVariable UUID templateId) {
        return MyCouponResponse.from(couponClaimService.claim(userId, templateId));
    }
}
