package com.shop.platform.coupon.model;

/**
 * 用户券来源：CLAIM 主动/活动领取，REFUND_RETURN 退款回退发放的新券。
 *
 * <p>记来源是为了对账时分得清「发出去多少张」里有多少是退款补偿——这部分不是营销成本，是履约成本。
 */
public enum CouponSource {
    CLAIM,
    REFUND_RETURN
}
