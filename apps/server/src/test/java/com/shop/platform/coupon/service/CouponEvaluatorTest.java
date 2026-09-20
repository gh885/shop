package com.shop.platform.coupon.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.Money;
import com.shop.platform.coupon.api.CouponAvailabilityView;
import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.UserCouponStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 券规则引擎单测 —— 这里的分支决定「减多少钱」，改一次等于改线上金额，所以边界与兜底必须钉死。
 *
 * <p>口径（coupon.md §5 的定案）：门槛基数 = 适用商品销售价小计（不含运费、平行优惠）；
 * 减免额封顶于基数；可用性以绝对时间为准。
 */
class CouponEvaluatorTest {

    private final CouponEvaluator evaluator = new CouponEvaluator();

    private final OffsetDateTime now = OffsetDateTime.parse("2026-03-10T12:00:00+08:00");

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    /** 造一张券：默认「满 100 减 20」，此刻生效、7 天后到期、CNY、未使用 */
    private UserCoupon coupon(long threshold, long discount) {
        return UserCoupon.builder()
                .id(UUID.randomUUID())
                .templateId(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("满减券")
                .thresholdAmount(threshold)
                .discountAmount(discount)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.minusDays(1))
                .expireAt(now.plusDays(7))
                .status(UserCouponStatus.UNUSED)
                .source(CouponSource.CLAIM)
                .build();
    }

    private List<CouponAvailabilityView> evaluate(List<UserCoupon> candidates, long baseAmountFen) {
        return evaluator.evaluate(candidates, Money.cny(baseAmountFen), now);
    }

    // ---- 门槛 ----

    @Test
    void 达到门槛_可用且减面额() {
        var result = evaluate(List.of(coupon(10000, 2000)), 10000);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().usable()).isTrue();
        assertThat(result.getFirst().discount()).isEqualTo(Money.cny(2000));
        assertThat(result.getFirst().unavailableReason()).isNull();
    }

    @Test
    void 未达门槛_不可用且原因为门槛() {
        var result = evaluate(List.of(coupon(10000, 2000)), 9999);

        // 差 1 分也不行：门槛是硬边界，不四舍五入也不「差不多就行」
        assertThat(result.getFirst().usable()).isFalse();
        assertThat(result.getFirst().discount()).isEqualTo(Money.cny(0));
        assertThat(result.getFirst().unavailableReason()).isEqualTo(CouponUnavailableReason.THRESHOLD_NOT_MET);
    }

    @Test
    void 无门槛券_金额再小也可用_但封顶到订单金额() {
        var result = evaluate(List.of(coupon(0, 500)), 1);

        // 门槛为 0 只保证「可以用」，不等于能减满面额：封顶后实付为 0 而不是负数
        assertThat(result.getFirst().usable()).isTrue();
        assertThat(result.getFirst().discount()).isEqualTo(Money.cny(1));
    }

    // ---- 封顶 ----

    @Test
    void 面额超过基数_封顶到基数_保证实付不为负() {
        // 100 元券用在 50 元单上：只减 50，余额作废（满减券是一次性权益，不是可找零的余额）
        var result = evaluate(List.of(coupon(0, 10000)), 5000);

        assertThat(result.getFirst().usable()).isTrue();
        assertThat(result.getFirst().discount()).isEqualTo(Money.cny(5000));
    }

    // ---- 时间窗（以绝对时刻为准，不看状态列） ----

    @Test
    void 尚未生效_不可用且原因为未生效() {
        UserCoupon notYet = UserCoupon.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("预告券")
                .thresholdAmount(0L)
                .discountAmount(500L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.plusDays(1))
                .expireAt(now.plusDays(8))
                .status(UserCouponStatus.UNUSED)
                .build();

        var result = evaluate(List.of(notYet), 10000);
        assertThat(result.getFirst().unavailableReason()).isEqualTo(CouponUnavailableReason.NOT_EFFECTIVE);
    }

    @Test
    void 已过失效时刻_不可用且原因为过期_哪怕状态列还是未使用() {
        UserCoupon stale = UserCoupon.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("过期券")
                .thresholdAmount(0L)
                .discountAmount(500L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.minusDays(30))
                .expireAt(now.minusSeconds(1))
                .status(UserCouponStatus.UNUSED) // 收敛任务还没刷到
                .build();

        // 正确性不押在定时任务上：读时按 expire_at 判定，状态列落后不影响结论
        var result = evaluate(List.of(stale), 10000);
        assertThat(result.getFirst().usable()).isFalse();
        assertThat(result.getFirst().unavailableReason()).isEqualTo(CouponUnavailableReason.EXPIRED);
    }

    @Test
    void 失效时刻当刻即过期_边界不留给用户() {
        UserCoupon atBoundary = UserCoupon.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("边界券")
                .thresholdAmount(0L)
                .discountAmount(500L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.minusDays(1))
                .expireAt(now) // 正好此刻
                .status(UserCouponStatus.UNUSED)
                .build();

        assertThat(evaluate(List.of(atBoundary), 10000).getFirst().usable()).isFalse();
    }

    // ---- 币种护栏 ----

    @Test
    void 币种不一致_不可用且不折算() {
        UserCoupon usd = UserCoupon.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("美元券")
                .thresholdAmount(0L)
                .discountAmount(500L)
                .currency("USD")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.minusDays(1))
                .expireAt(now.plusDays(1))
                .status(UserCouponStatus.UNUSED)
                .build();

        var result = evaluator.evaluate(List.of(usd), Money.cny(10000), now);
        assertThat(result.getFirst().unavailableReason()).isEqualTo(CouponUnavailableReason.CURRENCY_MISMATCH);
    }

    @Test
    void 判定次序_过期优先于门槛_先给用户最要紧的原因() {
        UserCoupon expiredAndShort = UserCoupon.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("过期且不够额")
                .thresholdAmount(100000L)
                .discountAmount(500L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.minusDays(30))
                .expireAt(now.minusDays(1))
                .status(UserCouponStatus.UNUSED)
                .build();

        // 两个原因都成立时说过期：「已经没救了」比「再买点就能用」更该先说
        assertThat(evaluate(List.of(expiredAndShort), 100).getFirst().unavailableReason())
                .isEqualTo(CouponUnavailableReason.EXPIRED);
    }

    // ---- 排序（= 结算页默认选券次序） ----

    @Test
    void 排序_可用在前_优惠大的在前_同额快到期的在前() {
        UserCoupon big = coupon(0, 3000); // 减 30
        UserCoupon small = coupon(0, 1000); // 减 10
        UserCoupon unusable = coupon(100000, 3000); // 未达门槛
        UserCoupon expiringSooner = UserCoupon.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shopId(shopId)
                .name("同额但先到期")
                .thresholdAmount(0L)
                .discountAmount(3000L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(now.minusDays(1))
                .expireAt(now.plusHours(1))
                .status(UserCouponStatus.UNUSED)
                .build();

        var result = evaluate(List.of(unusable, small, big, expiringSooner), 20000);

        // 可用的排前面；同为 30 元时快到期的先（平台想先用快过期的）
        assertThat(result).extracting(CouponAvailabilityView::usable).containsExactly(true, true, true, false);
        assertThat(result.getFirst().userCouponId()).isEqualTo(expiringSooner.getId());
        assertThat(result.get(1).userCouponId()).isEqualTo(big.getId());
        assertThat(result.get(2).userCouponId()).isEqualTo(small.getId());
        assertThat(result.getLast().userCouponId()).isEqualTo(unusable.getId());
    }

    @Test
    void 候选为空_返回空列表不炸() {
        assertThat(evaluate(List.of(), 10000)).isEmpty();
    }
}
