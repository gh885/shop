package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.model.CouponTemplateStatus;
import com.shop.platform.coupon.model.CouponType;
import com.shop.platform.infra.db.AuditedEntity;
import java.math.BigDecimal;
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
 * <p>一期只有一种玩法：满 threshold_amount 减 discount_amount（threshold_amount = 0 即无门槛）；
 * 二期起以 {@link CouponType} 判别，DISCOUNT 型用折率与封顶两列（见该枚举）。
 * 两型的列互斥由 DB CHECK 钉死，不用「discount_amount 为 0」那种空缺约定。
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

    /** 减免额（分），恒大于 0；DISCOUNT 型为 null（面值由折率与封顶表达） */
    private Long discountAmount;

    private String currency;

    /** 承担方（一期恒 SELLER）：领取时快照进用户券，再随订单落快照 */
    private CouponBearer bearer;

    /** 绝对有效期起点：券只能在此之后被领取与使用 */
    private OffsetDateTime validFrom;

    /** 绝对有效期终点 */
    private OffsetDateTime validTo;

    /**
     * 相对有效期（天）：领取后 N 天有效（CPN-68）。为 null 时用户券沿用本模板的绝对窗口 [validFrom, validTo)。
     * 与 validFrom/validTo 不同轴：后两者是**发放窗口**（什么时候能领），这一列管的是**领到之后能用多久**。
     */
    private Integer validDays;

    /** 券型判别（CPN-01） */
    private CouponType type;

    /** 折扣率（0.01~0.99，0.90 = 9 折）：仅 DISCOUNT 型非空 */
    private BigDecimal discountRate;

    /** 折扣封顶（分）：仅 DISCOUNT 型非空，必填（CPN-65） */
    private Long maxDiscountAmount;

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

    /** 减免额配上币种成 Money（只读转换，非表字段）；DISCOUNT 型无定值面额，返回 null */
    public Money discountAsMoney() {
        return Money.ofFenOrNull(discountAmount, currency);
    }

    /** 折扣封顶配上币种成 Money（只读转换，非表字段）；DISCOUNT 型非空 */
    public Money maxDiscountAsMoney() {
        return Money.ofFenOrNull(maxDiscountAmount, currency);
    }

    /** 发放名额是否已用满（CPN-13/16：issued ≥ total）——「已领完」在这个仓库里的唯一定义处 */
    public boolean fullyIssued() {
        return issuedQuantity >= totalQuantity;
    }

    /** 发放是否还没到起点（CPN-07）：未到起点的券照样进可领列表当预告位（C9），但领不到 */
    public boolean issuanceNotStarted(OffsetDateTime now) {
        return now.isBefore(validFrom);
    }

    /** 发放是否已结束（CPN-13）：终点是开区间，now 正好等于 validTo 即已结束 */
    public boolean issuanceEnded(OffsetDateTime now) {
        return !now.isBefore(validTo);
    }

    /**
     * 此刻领不领得到（CPN-13/14）：名额未用满且落在发放窗口内。<b>可领列表的 claimable 与领券端点的
     * 时间/名额闸门同读这一个式子</b>——两处各写一遍比较式，就会出现「列表说可领、点了被拒」。
     *
     * <p>状态列刻意不在式子里：列表那侧由查询只取 ACTIVE，领取那侧要单独给出「已停止发放」这句 400 文案。
     * 名额与窗口的<b>并发</b>判定也不在此：这里是读时的一次快照判定，写入时由
     * {@code CouponTemplateMapper.issueOne} 的条件 UPDATE 以同一条款原子重算。
     */
    public boolean claimableAt(OffsetDateTime now) {
        return !fullyIssued() && !issuanceNotStarted(now) && !issuanceEnded(now);
    }
}
