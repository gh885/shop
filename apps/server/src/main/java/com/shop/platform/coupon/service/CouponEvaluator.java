package com.shop.platform.coupon.service;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponAvailabilityView;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.coupon.mapper.UserCoupon;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 券规则引擎 —— 纯计算：给定「一批候选券 + 本单适用商品小计」，回答每张券能不能用、能用就减多少。
 *
 * <p>无 IO、无事务、无状态，因此可以被结算预览与真实下单<b>同一条链路</b>复用（见 order 的 CheckoutResolver）。
 * 「预览一个价、下单另一个价」是最经典的客诉来源，这个类不碰数据库就是为了让它不可能发生。
 *
 * <p>口径全部是定案（改动等于改线上金额，见 docs/decisions/coupon.md §5）：
 *
 * <ul>
 *   <li><b>门槛基数 = 适用商品的销售价小计</b>：不含运费、不含划线价、不含其他优惠。一期券范围 = 本店全部商品，
 *       所以基数就是该店的商品额（order 分组算钱时已经算好）。
 *   <li><b>平行优惠</b>：所有优惠都基于原始适用金额判定与计算，互不影响、可并行、用户能自己算清楚。
 *       递进优惠（基于上一轮优惠后金额）刻意不采用。
 *   <li><b>减免额封顶于基数</b>：100 元无门槛券用在 50 元订单上只减 50，余额作废——满减券是一次性权益，
 *       不是可找零的余额。这一条也保证了实付不为负。
 *   <li><b>可用性以绝对时间为准</b>：直接比 effective_at / expire_at，不看状态列（状态列只是展示投影，
 *       由定时任务收敛；正确性不押在调度器上）。
 * </ul>
 */
@Component
public class CouponEvaluator {

    /**
     * 评估顺序 = 结算页的默认展示与默认选券顺序：可用的在前，优惠大的在前，同额快到期的在前。
     *
     * <p>「默认选哪张」是业务决策，必须显式定死（用户想省最多，平台想先用快过期的）——这里选前者为主序、
     * 后者为次序，并允许用户手动切换。次序键带上 expireAt 与 id 保证结果稳定可比。
     */
    private static final Comparator<CouponAvailabilityView> ORDER = Comparator.comparing(CouponAvailabilityView::usable)
            .reversed()
            .thenComparing(e -> e.discount().amount(), Comparator.reverseOrder())
            .thenComparing(CouponAvailabilityView::expireAt)
            .thenComparing(CouponAvailabilityView::userCouponId);

    /**
     * 批量评估并排序。
     *
     * @param baseAmount 本券适用范围的商品小计，不含运费；其币种即本单币种，与券币种不一致的券判为不可用
     */
    public List<CouponAvailabilityView> evaluate(List<UserCoupon> candidates, Money baseAmount, OffsetDateTime now) {
        return candidates.stream()
                .map(coupon -> evaluateOne(coupon, baseAmount, now))
                .sorted(ORDER)
                .toList();
    }

    /**
     * 单张券评估。不可用原因的判定次序 = 用户最可能问起的次序：
     * 先时间（券还没生效 / 已经过期），再币种，最后门槛。
     */
    private static CouponAvailabilityView evaluateOne(UserCoupon coupon, Money baseAmount, OffsetDateTime now) {
        // 1. 时间窗：以绝对时刻为准，不看状态列
        CouponUnavailableReason reason = null;
        if (now.isBefore(coupon.getEffectiveAt())) {
            reason = CouponUnavailableReason.NOT_EFFECTIVE;
        } else if (!now.isBefore(coupon.getExpireAt())) {
            reason = CouponUnavailableReason.EXPIRED;
        } else if (!baseAmount.currency().equals(coupon.getCurrency())) {
            // 2. 币种：不支持跨币种用券（一期恒 CNY，护栏先立住）。比的是币种码而不是拿 Money 相加，
            //    这里「不一致」是正常分支，不该走成运算护栏那次 400
            reason = CouponUnavailableReason.CURRENCY_MISMATCH;
        } else if (!baseAmount.atLeast(coupon.thresholdAsMoney())) {
            // 3. 门槛：基数是不含运费的商品小计
            reason = CouponUnavailableReason.THRESHOLD_NOT_MET;
        }

        if (reason != null) {
            return new CouponAvailabilityView(
                    coupon.getId(),
                    coupon.getName(),
                    coupon.thresholdAsMoney(),
                    Money.zero(coupon.getCurrency()),
                    coupon.getBearer(),
                    coupon.getExpireAt(),
                    false,
                    reason);
        }

        // 4. 可减金额 = min(面额, 基数)：封顶见类注释
        Money face = coupon.discountAsMoney();
        return new CouponAvailabilityView(
                coupon.getId(),
                coupon.getName(),
                coupon.thresholdAsMoney(),
                face.atLeast(baseAmount) ? baseAmount : face,
                coupon.getBearer(),
                coupon.getExpireAt(),
                true,
                null);
    }
}
