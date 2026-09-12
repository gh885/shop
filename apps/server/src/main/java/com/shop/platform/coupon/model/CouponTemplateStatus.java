package com.shop.platform.coupon.model;

/**
 * 券模板状态：ACTIVE 可领可用，STOPPED 停止领取（已领出的券不受影响——实例是快照，见 coupon.md §2.2）。
 *
 * <p>刻意不做软删除：券模板是券的溯源对象，删了会让「这张券从哪来的」断线；停用即下架。
 */
public enum CouponTemplateStatus {
    ACTIVE,
    STOPPED
}
