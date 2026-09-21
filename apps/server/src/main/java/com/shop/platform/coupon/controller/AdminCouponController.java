package com.shop.platform.coupon.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.coupon.service.CouponAdminService;
import com.shop.platform.infra.security.authz.RequirePermission;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台优惠券运营（认证由 StaffAuthFilter 统一处理）。
 *
 * <p>目前只有作废一个动作：风控封禁/误发回收的执行入口（C7）。查券列表刻意没做——作废拿
 * userCouponId 即可执行，管理端入口页等真实运营诉求出现时再随 admin 查券端点一起补。
 *
 * <p>权限暂用 CMS_MANAGE（运营岗 OPS）：admin 域没有「券运营」专用权限码，而
 * {@code common.Permissions} 是全库契约、不随本功能扩；要做成独立授权点时在权限码契约里
 * 增补（如 COUPON_OPS）并替换此注解。
 */
@Tag(name = "admin-coupons", description = "平台优惠券运营（作废）")
@RestController
@RequestMapping("/admin/coupons")
@RequiredArgsConstructor
@RequirePermission(Permissions.CMS_MANAGE)
public class AdminCouponController {

    private final CouponAdminService couponAdminService;

    /** 运营作废：仅 UNUSED → VOID；LOCKED/USED 等状态 409 并给可理解的 detail；券不存在 404 */
    @PostMapping("/{id}/void")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void voidUserCoupon(@PathVariable UUID id) {
        couponAdminService.voidCoupon(id);
    }
}
