package com.shop.platform.coupon;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.api.CouponUnavailableReason;
import com.shop.platform.coupon.mapper.UserCoupon;
import com.shop.platform.coupon.model.CouponSource;
import com.shop.platform.coupon.model.UserCouponStatus;
import com.shop.platform.coupon.service.MyCoupon;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 券包行的展示派生（C8）：status 是读时算的展示状态，时间原因只对「还在手上」的券给出。
 *
 * <p>时间判定本身（边界、次序）归 {@code CouponEvaluatorTest}（同一方法 {@code CouponEvaluator.timeReason}），
 * 这里只验券包侧的三条语义：过期未收敛 → 展示 EXPIRED、未生效 → NOT_EFFECTIVE、终态券不挂时间原因。
 */
class MyCouponTest {

    private final OffsetDateTime now = OffsetDateTime.parse("2026-03-10T12:00:00+08:00");

    private UserCoupon coupon(UserCouponStatus status, OffsetDateTime effectiveAt, OffsetDateTime expireAt) {
        return UserCoupon.builder()
                .id(UUID.randomUUID())
                .templateId(UUID.randomUUID())
                .userId(UUID.randomUUID())
                .shopId(UUID.randomUUID())
                .name("满减券")
                .thresholdAmount(0L)
                .discountAmount(500L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .effectiveAt(effectiveAt)
                .expireAt(expireAt)
                .status(status)
                .source(CouponSource.CLAIM)
                .build();
    }

    @Test
    void 未使用且时间窗正常_展示未使用且无时间原因() {
        MyCoupon row = MyCoupon.of(coupon(UserCouponStatus.UNUSED, now.minusDays(1), now.plusDays(1)), "测试店", now);

        assertThat(row.displayStatus()).isEqualTo(UserCouponStatus.UNUSED);
        assertThat(row.timeReason()).isNull();
    }

    @Test
    void 未生效的券_展示未使用但带未开始原因() {
        MyCoupon row = MyCoupon.of(coupon(UserCouponStatus.UNUSED, now.plusDays(1), now.plusDays(8)), "测试店", now);

        assertThat(row.displayStatus()).isEqualTo(UserCouponStatus.UNUSED);
        assertThat(row.timeReason()).isEqualTo(CouponUnavailableReason.NOT_EFFECTIVE);
    }

    @Test
    void 过期未收敛的券_展示直接是已过期_不再重复挂时间原因() {
        MyCoupon row = MyCoupon.of(coupon(UserCouponStatus.UNUSED, now.minusDays(8), now.minusSeconds(1)), "测试店", now);

        // 展示状态已经说了「已过期」，再挂一个 EXPIRED 原因只是让前端多做一次去重
        assertThat(row.displayStatus()).isEqualTo(UserCouponStatus.EXPIRED);
        assertThat(row.timeReason()).isNull();
    }

    @Test
    void 被占用的券已过失效时刻_仍是结算中并如实给出过期原因() {
        // 收敛任务不动 LOCKED（优惠已定格在订单上），券包里这张券状态是「结算中」——
        // 光看状态用户不知道它其实已经过期，时间原因在这里补上这一格信息
        MyCoupon row = MyCoupon.of(coupon(UserCouponStatus.LOCKED, now.minusDays(8), now.minusSeconds(1)), "测试店", now);

        assertThat(row.displayStatus()).isEqualTo(UserCouponStatus.LOCKED);
        assertThat(row.timeReason()).isEqualTo(CouponUnavailableReason.EXPIRED);
    }

    @Test
    void 终态券不挂时间原因_徽章本身就是解释() {
        assertThat(MyCoupon.of(coupon(UserCouponStatus.USED, now.minusDays(8), now.minusDays(1)), "测试店", now)
                        .timeReason())
                .isNull();
        assertThat(MyCoupon.of(coupon(UserCouponStatus.VOID, now.minusDays(8), now.minusDays(1)), "测试店", now)
                        .timeReason())
                .isNull();
    }
}
