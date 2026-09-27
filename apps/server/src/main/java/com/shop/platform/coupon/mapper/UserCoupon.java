package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.CouponType;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.coupon.service.CouponFaceValue;
import com.shop.platform.infra.db.AuditedEntity;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 用户券 —— 用户领取后持有的一张券，规则字段是领取瞬间从模板复制来的<b>快照</b>。
 *
 * <p>快照不是冗余，是这条设计的地基：运营改一次配置不能让历史数据跟着变（coupon.md §2.2）。
 * 读券路径（券包、结算可用性判定）因此完全不碰 coupon_templates。
 *
 * <p>状态机与 order_id 的含义见 {@link UserCouponStatus}：order_id 是「本券当前关联的订单」，
 * LOCKED 时是占用的单，USED 时是核销的单；UNUSED/EXPIRED/VOID 必为空（DB 的 ck_user_coupons_order_ref 强制）。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("coupon.user_coupons")
public class UserCoupon extends AuditedEntity {

    /** 来源模板，coupon.coupon_templates.id（仅溯源用，读券不回查它） */
    private UUID templateId;

    /** 持有人，account.users.id */
    private UUID userId;

    /** 归属店铺（快照）：券包按店展示、结算按店取券都靠它 */
    private UUID shopId;

    /** 券名快照 */
    private String name;

    /** 门槛快照（分） */
    private Long thresholdAmount;

    /** 减免额快照（分）：FULL_REDUCTION 型非空；DISCOUNT 型为 null（面值由折率与封顶表达） */
    private Long discountAmount;

    private String currency;

    /** 承担方快照：order 落订单快照时从这里取，不在 order 里硬编码 SELLER */
    private CouponBearer bearer;

    /** 券型快照（CPN-01）：决定实减额是「面额封顶」还是「打折再封顶」 */
    private CouponType type;

    /** 折扣率快照（0.01~0.99）：仅 DISCOUNT 型非空 */
    private BigDecimal discountRate;

    /** 折扣封顶快照（分）：仅 DISCOUNT 型非空 */
    private Long maxDiscountAmount;

    /** 生效时刻（绝对值，领取时固化） */
    private OffsetDateTime effectiveAt;

    /** 失效时刻（绝对值，领取时固化）。判定以它为准，不看状态列 */
    private OffsetDateTime expireAt;

    private UserCouponStatus status;

    /** CLAIM 领取所得 / REFUND_RETURN 退款补偿所得 */
    private CouponSource source;

    /** 当前关联订单：LOCKED = 占用的单，USED = 核销的单，其余状态为 null */
    private UUID orderId;

    private OffsetDateTime lockedAt;

    private OffsetDateTime usedAt;

    /**
     * 本单实际减免额（分）：LOCKED 时由下单方给定并定格，此后 USE / RELEASE / RETURN 的流水都取它。
     *
     * <p>刻意记「实际减免额」而不是券面额——满减券封顶于商品额，面额 100 用在 50 元单上实减 50，
     * 流水与对账要的是 50。也让券模块的流水不依赖 order 回传金额。
     */
    private Long appliedDiscountAmount;

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

    /**
     * 本单基数上这张券的实减额（Money）：面值算法只有这一处，
     * 结算预览与真实下单因此不可能算出两个数（券面值随基数变，两处各算一次就会漂）。
     *
     * @param baseAmount 本券适用范围的商品小计（调用方已判过币种）
     */
    public Money faceValueOn(Money baseAmount) {
        return Money.ofFen(
                CouponFaceValue.discountOf(type, discountAmount, discountRate, maxDiscountAmount, baseAmount),
                currency);
    }

    /** 是否已过失效时刻：可用性判定的唯一时间口径（状态列只是它的展示投影） */
    public boolean expiredAt(OffsetDateTime now) {
        return !now.isBefore(expireAt);
    }

    /** 本单实际减免额配上币种成 Money（只读转换，非表字段）；未占用时为 null */
    public Money appliedDiscountAsMoney() {
        return Money.ofFenOrNull(appliedDiscountAmount, currency);
    }
}
