package com.shop.platform.coupon.controller;

import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.Permissions;
import com.shop.platform.coupon.dto.AdminCouponQuery;
import com.shop.platform.coupon.service.AdminCouponItem;
import com.shop.platform.coupon.service.CouponAdminService;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentStaff;
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
 * 平台优惠券运营（认证由 StaffAuthFilter 统一处理）。
 *
 * <p>查询与作废统一使用 COUPON_OPS（OPS 岗位），与 CMS 内容维护解耦。
 */
@Tag(name = "admin-coupons", description = "平台优惠券运营（作废）")
@RestController
@RequestMapping("/admin/coupons")
@RequiredArgsConstructor
@RequirePermission(Permissions.COUPON_OPS)
public class AdminCouponController {

    private final CouponAdminService couponAdminService;

    /** 运营列表：按用户、店铺、状态组合筛选分页。 */
    @GetMapping
    public PageResult<AdminCouponItem> listAdminCoupons(@Valid PageParams pageParams, @Valid AdminCouponQuery query) {
        return couponAdminService.pageCoupons(pageParams, query);
    }

    /** 运营作废：仅 UNUSED → VOID；LOCKED/USED 等状态 409 并给可理解的 detail；券不存在 404 */
    @PostMapping("/{id}/void")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void voidUserCoupon(@CurrentStaff UUID staffId, @PathVariable UUID id) {
        couponAdminService.voidCoupon(id, staffId);
    }
}
