package com.shop.platform.coupon.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 券型判别（CPN-01）：{@code FULL_REDUCTION} 满减（threshold + discount_amount）与
 * {@code DISCOUNT} 折扣（discount_rate + max_discount_amount）。
 *
 * <p>两型共用门槛与承担方，差别只在「面值怎么算」：满减是定值，折扣是按基数打折再封顶（CPN-66）。
 * 判据落在 DB CHECK 上（{@code ck_coupon_templates_discount_shape} 与 user_coupons 的同名约束），
 * 所以「折扣券没填封顶」这类半份配置写不进库，不靠应用层记得校验。
 */
@Schema(enumAsRef = true)
public enum CouponType {

    /** 满 threshold 减 discount_amount（threshold=0 即无门槛券） */
    FULL_REDUCTION,

    /** 满 threshold 打 discount_rate 折，最高减 max_discount_amount（封顶必填，CPN-65） */
    DISCOUNT
}
