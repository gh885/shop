package com.shop.platform.coupon.service;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.model.CouponType;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 面值计算：一张券在给定基数上能减多少（CPN-22 与 CPN-66 的唯一定义处）。
 *
 * <p>两型两段封顶，顺序固定：
 * <ol>
 *   <li><b>券自己的面值</b>：满减 = {@code discount_amount}；折扣 = {@code round(基数 × (1 - rate))} 再对 {@code max_discount_amount} 取小；</li>
 *   <li><b>商品额</b>：面值再对基数取小（券不是可找零余额，超出部分作废）。</li>
 * </ol>
 * 顺序反了会在「折扣额 > 基数」时多减一次，所以这里收成一个方法而不是两处各 min 一次。
 *
 * <p>无 IO、无状态：结算预览与真实下单同一条链路调用它（CPN-25）。
 */
public final class CouponFaceValue {

    /**
     * 实减额（分）。{@code coupon} 传用户券（结算判定）或模板（卖家端预览）时都靠它自带的快照列判定券型。
     *
     * @param baseAmount 本券适用范围的商品小计（同币种，已由调用方判过币种）
     */
    public static long discountOf(
            CouponType type, Long discountAmount, BigDecimal discountRate, Long maxDiscountAmount, Money baseAmount) {
        long base = baseAmount.amount();
        long face = type == CouponType.DISCOUNT ? roundedDiscount(base, discountRate) : nullSafe(discountAmount);
        if (type == CouponType.DISCOUNT && maxDiscountAmount != null) {
            face = Math.min(face, maxDiscountAmount);
        }
        // 第二段封顶：面值不得超过商品额（CPN-22）
        return Math.min(face, base);
    }

    /** 折扣实减 = 四舍五入到分的 基数 × (1 - 折率) */
    private static long roundedDiscount(long base, BigDecimal rate) {
        if (rate == null) {
            return base;
        }
        BigDecimal payableRatio = BigDecimal.ONE.subtract(rate);
        return BigDecimal.valueOf(base)
                .multiply(payableRatio)
                .setScale(0, RoundingMode.HALF_UP)
                .longValueExact();
    }

    private static long nullSafe(Long value) {
        return value == null ? 0L : value;
    }

    private CouponFaceValue() {}
}
