package com.shop.platform.coupon.service;

import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.model.UserCouponStatus;
import java.time.OffsetDateTime;

/**
 * 券包行 —— 券本体 + 店名 + <b>展示状态</b> + 时间类可用性原因。
 *
 * <p>展示状态与库里的 status 刻意分开：过期以绝对时间为准（读时判定），而收敛任务可能还没刷到，
 * 库里还是 UNUSED。若直接吐 status，用户会在「未使用」里看到一张早过期的券。
 * 这是「正确性不押在调度器上」在出参上的体现。
 *
 * <p>{@code timeReason} 只回答时间维度的「为什么现在不能用在单上」（C8）：未开始 / 已过期，
 * 判定复用 {@link CouponEvaluator#timeReason}（与结算同一口径）。门槛类原因需要基数上下文，
 * 券包没有购物车，算不出也不硬算，一律不出门槛/币种码。
 */
public record MyCoupon(
        UserCoupon coupon, String shopName, UserCouponStatus displayStatus, CouponUnavailableReason timeReason) {

    /**
     * 派生展示状态：未使用但已过失效时刻 → 展示为已过期。
     * 时间原因只对「还在手上」的券（展示状态 UNUSED/LOCKED）给出——已使用/已作废/已过期行的状态徽章
     * 本身就是解释，再挂一个时间码只会变成前端要逐条消音的噪音。
     */
    public static MyCoupon of(UserCoupon coupon, String shopName, OffsetDateTime now) {
        UserCouponStatus display = coupon.getStatus() == UserCouponStatus.UNUSED && coupon.expiredAt(now)
                ? UserCouponStatus.EXPIRED
                : coupon.getStatus();
        CouponUnavailableReason reason = display == UserCouponStatus.UNUSED || display == UserCouponStatus.LOCKED
                ? CouponEvaluator.timeReason(coupon, now)
                : null;
        return new MyCoupon(coupon, shopName, display, reason);
    }
}
