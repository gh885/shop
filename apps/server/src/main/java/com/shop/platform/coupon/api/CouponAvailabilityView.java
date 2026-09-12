package com.shop.platform.coupon.api;

import com.shop.platform.common.Money;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 单张券的可用性评估结果（跨模块契约）—— 结算页与券包的共同语言。
 *
 * <p>刻意同时带「能不能用」与「不能用是为什么」（{@link #unavailableReason}）：只回 boolean 会让结算页
 * 无法解释，用户只能去投诉。原因码是契约的一部分，前端按码出文案。
 *
 * <p>{@link #discount} 是<b>本单可减金额</b>，不是券面额：满减券封顶于适用商品小计，面额 100 用在 50 元的单上减 50。
 */
public record CouponAvailabilityView(
        UUID userCouponId,
        String name,
        /** 使用门槛（配币种）：结算页展示「满 X 可用」 */
        Money threshold,
        /** 本单可减金额；不可用时为 0 */
        Money discount,
        /** 承担方：order 落订单快照时取用 */
        CouponBearer bearer,
        /** 失效时刻：结算页展示到期时间，也是默认选券的次序依据 */
        OffsetDateTime expireAt,
        boolean usable,
        /** 不可用原因码；usable = true 时为 null */
        CouponUnavailableReason unavailableReason) {}
