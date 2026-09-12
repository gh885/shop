package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.model.CouponUsageAction;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 券核销流水 —— append-only 账本：一张券的每一次状态变动留一行，永不更新。
 *
 * <p>继承 {@link BaseEntity} 而非 AuditedEntity：append-only 的表没有 updated_at 列。
 * 状态列说得清「现在是什么」，流水才说得清「中间发生过什么」——取消后改单再核销，靠状态列分不出这两轮。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("coupon.coupon_usages")
public class CouponUsage extends BaseEntity {

    /** 被操作的券，coupon.user_coupons.id */
    private UUID userCouponId;

    /** 本动作关联的订单 */
    private UUID orderId;

    private UUID userId;

    private UUID shopId;

    private CouponUsageAction action;

    /** 本次动作涉及的减免额（分）：RELEASE/RETURN 记原额，便于按券对账 */
    private Long discountAmount;

    private String currency;

    /** 本次动作金额配上币种成 Money（只读转换，非表字段） */
    public Money discountAsMoney() {
        return Money.ofFen(discountAmount, currency);
    }
}
