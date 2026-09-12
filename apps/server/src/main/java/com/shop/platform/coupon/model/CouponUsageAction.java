package com.shop.platform.coupon.model;

/**
 * 核销流水动作 —— 一张券的每一次状态变动都留一行，append-only。
 *
 * <p>LOCK → USE 是正常路径；LOCK → RELEASE 是取消/超时关单；RETURN 记在退款退券上（原券保持 USED）。
 * 只靠 user_coupons 的状态列回放不出历史：取消后改单再核销，状态列只会说「USED」，流水才说得清中间发生过什么。
 */
public enum CouponUsageAction {
    LOCK,
    USE,
    RELEASE,
    RETURN
}
