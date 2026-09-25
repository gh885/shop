package com.shop.platform.coupon.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.mapper.CouponTemplate;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 店铺可领券行（匿名可访问）。
 *
 * <p>刻意不带「我领过没领过」：这个端点是匿名的（与商品浏览同一条匿名通道），拿不到当前用户。
 * 重复领取由领券端点用 409 + COUPON_ALREADY_CLAIMED 明确告知，前端也可用券包自行判定。
 *
 * <p>领完的券仍会出现在列表里（soldOut = true），未到发放起点的券也会（claimable = false，C9），
 * 置灰显示而不是消失——活动没了和不办活动是两件事，「x 点开抢」本身就是营销位。
 */
@Schema(name = "ClaimableCouponResponse")
public record ClaimableCouponView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) String name,
        /** 使用门槛；0 表示无门槛 */
        @Schema(requiredMode = REQUIRED) Money threshold,
        @Schema(requiredMode = REQUIRED) Money discount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime validFrom,
        @Schema(requiredMode = REQUIRED) OffsetDateTime validTo,
        @Schema(requiredMode = REQUIRED) Boolean soldOut,
        /** 当下就能领：已到发放起点且未领完。false 时前端据 soldOut/validFrom 区分「已领完」与「未开始」 */
        @Schema(requiredMode = REQUIRED) Boolean claimable) {

    /** 装配一行：两个标记都取 {@link CouponTemplate} 上的判定，本类不再自己写比较式 */
    public static ClaimableCouponView from(CouponTemplate t, OffsetDateTime now) {
        return new ClaimableCouponView(
                t.getId(),
                t.getName(),
                t.thresholdAsMoney(),
                t.discountAsMoney(),
                t.getValidFrom(),
                t.getValidTo(),
                t.fullyIssued(),
                // 与领券端点是同一个式子（CouponTemplate.claimableAt）；列表内 ACTIVE 且未结束由查询保证，
                // 所以这里为 false 的只剩「未到起点」与「已领完」两种
                t.claimableAt(now));
    }
}
