package com.shop.platform.coupon.api;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 券不可用的原因码 —— 可用性判定必须是<b>可解释的</b>，不能只回一个 boolean。
 *
 * <p>结算页与券包都要回答「为什么这张券不能用」：用户看不懂就只能投诉。原因码是<b>契约的一部分</b>
 * （前端按码出文案），因此放在 api 包，与 {@code CouponAvailabilityView} 同域。
 *
 * <p>这里自带一句兜底文案（{@link #message()}），供后端直接拼 400 detail 用。
 *
 * <p>{@code enumAsRef} 让 springdoc 输出 {@code $ref} 组件而不是内联枚举：可空枚举被内联成
 * {@code type:["string","null"] + enum} 时，openapi-ts 生成的 zod 会拒绝 null（脚本 sdk-audit 会拦下）。
 * 与 {@code OrderTimeout} 同一处理。
 */
@Schema(enumAsRef = true)
public enum CouponUnavailableReason {

    /** 未到生效时间（券已到手，但要到期才可用） */
    NOT_EFFECTIVE("优惠券尚未生效"),

    /** 已过期：以绝对时间判定（now &gt; expire_at），不看状态列 */
    EXPIRED("优惠券已过期"),

    /** 未达门槛：本券适用范围的商品小计不足 threshold_amount */
    THRESHOLD_NOT_MET("未达到优惠券的使用门槛"),

    /** 币种不符：券与本单币种不一致（一期恒 CNY，字段先立住） */
    CURRENCY_MISMATCH("优惠券币种与本单不一致");

    private final String message;

    CouponUnavailableReason(String message) {
        this.message = message;
    }

    /** 给用户看的一句话：400 detail 与结算页兜底文案都用它 */
    public String message() {
        return message;
    }
}
