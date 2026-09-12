package com.shop.platform.coupon.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.coupon.controller.response.CouponTemplateResponse;
import com.shop.platform.coupon.dto.CreateCouponTemplateRequest;
import com.shop.platform.coupon.service.CouponTemplateService;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 店铺优惠券管理（授权要求 COUPON_MANAGE）。shopId 从店铺上下文（X-Shop-Id，ShopMembershipFilter
 * 校验成员身份）取，前端不传店 ID；越店访问在 service 层按 shop_id 校验，一律 404。
 *
 * <p>三个端点：列表、建券、停券。没有「改券」——已发出的券是快照，改模板只会影响后来的领取者，
 * 容易让人误以为「改了就是全都改了」，要调整就停掉旧的、建一张新的。
 */
@Tag(name = "seller-coupons", description = "店铺优惠券（建券 / 停券 / 名额查看）")
@RestController
@RequestMapping("/seller/coupons")
@RequiredArgsConstructor
@RequirePermission(Permissions.COUPON_MANAGE)
public class SellerCouponController {

    private final CouponTemplateService couponTemplateService;

    /** 本店券列表：含发放总量与已发放数 */
    @GetMapping
    public PageResult<CouponTemplateResponse> listShopCoupons(@CurrentShop UUID shopId, @Valid PageParams pageParams) {
        return couponTemplateService.pageMine(shopId, pageParams).map(CouponTemplateResponse::from);
    }

    /** 新建券模板：建好即可被领取（有效期未到则领了暂不可用） */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CouponTemplateResponse createCoupon(
            @CurrentShop UUID shopId, @Valid @RequestBody CreateCouponTemplateRequest req) {
        return CouponTemplateResponse.from(couponTemplateService.create(shopId, req));
    }

    /** 停用券模板：停止继续领取，已领出的券照旧可用 */
    @PutMapping("/{id}/stop")
    public CouponTemplateResponse stopCoupon(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return CouponTemplateResponse.from(couponTemplateService.stop(shopId, id));
    }
}
