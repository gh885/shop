package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.model.CouponTemplateStatus;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 券模板 —— 卖家配置的发放规则（面额、门槛、有效期、总量）。
 *
 * <p>模板是「规则的定义」，用户券是「规则的快照」：领取时把需要的字段复制进 user_coupons，
 * 此后模板被改被停都不影响已发出的券。因此本表只用于两个场景——卖家管理，以及领券时的资格判定。
 *
 * <p>一期只有一种玩法：满 threshold_amount 减 discount_amount（threshold_amount = 0 即无门槛）。
 * 折扣券/运费券要额外的 rate 与封顶列，二期再以 type 判别列区分，属纯增量 ALTER。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("coupon.coupon_templates")
public class CouponTemplate extends AuditedEntity {

    /** 归属店铺，shop.shops.id，裸引用不加 FK */
    private UUID shopId;

    /** 券名（对买家展示） */
    private String name;

    /** 使用门槛（分）：适用商品小计需达到该值，0 = 无门槛 */
    private Long thresholdAmount;

    /** 减免额（分），恒大于 0 */
    private Long discountAmount;

    private String currency;

    /** 承担方（一期恒 SELLER）：领取时快照进用户券，再随订单落快照 */
    private CouponBearer bearer;

    /** 绝对有效期起点：券只能在此之后被领取与使用 */
    private OffsetDateTime validFrom;

    /** 绝对有效期终点 */
    private OffsetDateTime validTo;

    /** 发放总量 */
    private Integer totalQuantity;

    /** 已发放数：领券走条件更新（WHERE issued_quantity &lt; total_quantity）防超发 */
    private Integer issuedQuantity;

    /** ACTIVE 可领可用；STOPPED 停止领取（已领出的券不受影响） */
    private CouponTemplateStatus status;

    /** 门槛配上币种成 Money（只读转换，非表字段） */
    public Money thresholdAsMoney() {
        return Money.ofFen(thresholdAmount, currency);
    }

    /** 减免额配上币种成 Money（只读转换，非表字段） */
    public Money discountAsMoney() {
        return Money.ofFen(discountAmount, currency);
    }
}
