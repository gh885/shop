package com.shop.platform.coupon.service;

import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.model.UserCouponStatus;
import java.time.OffsetDateTime;

/**
 * 券包行 —— 券本体 + 店名 + <b>展示状态</b>。
 *
 * <p>展示状态与库里的 status 刻意分开：过期以绝对时间为准（读时判定），而收敛任务可能还没刷到，
 * 库里还是 UNUSED。若直接吐 status，用户会在「未使用」里看到一张早过期的券。
 * 这是「正确性不押在调度器上」在出参上的体现。
 */
public record MyCoupon(UserCoupon coupon, String shopName, UserCouponStatus displayStatus) {

    /** 派生展示状态：未使用但已过失效时刻 → 展示为已过期 */
    public static MyCoupon of(UserCoupon coupon, String shopName, OffsetDateTime now) {
        UserCouponStatus display = coupon.getStatus() == UserCouponStatus.UNUSED && coupon.expiredAt(now)
                ? UserCouponStatus.EXPIRED
                : coupon.getStatus();
        return new MyCoupon(coupon, shopName, display);
    }
}
