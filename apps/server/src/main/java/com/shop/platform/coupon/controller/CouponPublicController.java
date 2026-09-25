package com.shop.platform.coupon.controller;

import com.shop.platform.coupon.service.ClaimableCouponView;
import com.shop.platform.coupon.service.CouponClaimService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 店铺可领券（匿名可访问，路径在 /api/shops 下）。
 *
 * <p>与买家券包（/coupons/mine，需登录）分开：<b>浏览和持有是两件事</b>——把店铺活动页锁在登录后面
 * 会让未登录用户看不到任何营销信息。这也是唯一一个刻意不返「我领过没领过」的券端点：匿名通道里
 * 拿不到当前用户。
 *
 * <p>归 coupon 模块而不是 shop 模块：资源是券，店只是它的归属维度（与 logistics 承接
 * /orders/{id}/tracking 同一个道理）。
 */
@Tag(name = "coupons", description = "买家优惠券（券包 / 领券）")
@RestController
@RequestMapping("/api/shops")
@RequiredArgsConstructor
public class CouponPublicController {

    private final CouponClaimService couponClaimService;

    /** 本店可领的券：领完的（soldOut）与未到发放起点的（claimable=false，带 validFrom）都返回，前端置灰而不是消失 */
    @GetMapping("/{shopId}/coupons")
    public List<ClaimableCouponView> listShopClaimableCoupons(@PathVariable UUID shopId) {
        OffsetDateTime now = OffsetDateTime.now();
        return couponClaimService.claimable(shopId).stream()
                .map(template -> ClaimableCouponView.from(template, now))
                .toList();
    }
}
