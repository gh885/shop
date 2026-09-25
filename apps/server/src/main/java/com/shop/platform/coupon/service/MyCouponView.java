package com.shop.platform.coupon.service;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 我的券包行。
 *
 * <p>status 是<b>展示状态</b>（读时判定），可能与库里的列不一致：过期了但收敛任务还没刷到的券，
 * 这里出 EXPIRED 而不是 UNUSED —— 不能让用户在「未使用」里看到一张过期的券。
 */
@Schema(name = "MyCouponResponse")
public record MyCouponView(
        @Schema(requiredMode = REQUIRED) UUID id,
        @Schema(requiredMode = REQUIRED) UUID shopId,
        @Schema(requiredMode = REQUIRED) String shopName,
        @Schema(requiredMode = REQUIRED) String name,
        /** 使用门槛；0 表示无门槛 */
        @Schema(requiredMode = REQUIRED) Money threshold,
        @Schema(requiredMode = REQUIRED) Money discount,
        @Schema(requiredMode = REQUIRED) OffsetDateTime effectiveAt,
        @Schema(requiredMode = REQUIRED) OffsetDateTime expireAt,
        @Schema(requiredMode = REQUIRED) String status,
        /** CLAIM 领取所得 / REFUND_RETURN 退款补偿所得 */
        @Schema(requiredMode = REQUIRED) String source,
        /** 占用或核销本券的订单；未使用时为 null */
        @Schema(requiredMode = REQUIRED, nullable = true) UUID orderId,
        /**
         * 时间类可用性原因（C8）：NOT_EFFECTIVE（未开始）/ EXPIRED（已过期），时间窗正常或
         * 券已不在手上（USED/VOID 等）时为 null。门槛/币种类原因需要结算基数，券包算不出、不硬算。
         */
        @Schema(requiredMode = REQUIRED, nullable = true) CouponUnavailableReason unavailableReason) {

    public static MyCouponView from(MyCoupon m) {
        return new MyCouponView(
                m.coupon().getId(),
                m.coupon().getShopId(),
                m.shopName(),
                m.coupon().getName(),
                m.coupon().thresholdAsMoney(),
                m.coupon().discountAsMoney(),
                m.coupon().getEffectiveAt(),
                m.coupon().getExpireAt(),
                m.displayStatus().name(),
                m.coupon().getSource().name(),
                m.coupon().getOrderId(),
                m.timeReason());
    }
}
