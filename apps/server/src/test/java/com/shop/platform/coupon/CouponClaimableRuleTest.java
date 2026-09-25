package com.shop.platform.coupon;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.coupon.api.CouponBearer;
import com.shop.platform.coupon.mapper.CouponTemplate;
import com.shop.platform.coupon.model.CouponTemplateStatus;
import com.shop.platform.coupon.service.ClaimableCouponView;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * 「此刻这张模板领不领得到」的边界单测（CPN-13/14/63）。
 *
 * <p>可领列表的 claimable/soldOut 与领券端点的时间闸门同读 {@link CouponTemplate} 上的那三条判定，
 * 所以这里钉住的边界一次同时管住两端——两端各写一遍比较式时出现的「列表说可领、点了被拒」，
 * 从此只能是并发抢完这一种解释。
 *
 * <p>不碰库：列表侧的 SQL 过滤（只取 ACTIVE 且 validTo &gt; now）与名额的条件扣减归
 * {@code CouponFlowIT}，这里只验派生判定本身。
 */
class CouponClaimableRuleTest {

    private final OffsetDateTime now = OffsetDateTime.parse("2026-03-10T12:00:00+08:00");

    /** 造一张模板：默认「此刻正可领」（起点已过、终点未到、还剩名额） */
    private CouponTemplate template(OffsetDateTime validFrom, OffsetDateTime validTo, int issued, int total) {
        return CouponTemplate.builder()
                .id(UUID.randomUUID())
                .shopId(UUID.randomUUID())
                .name("满减券")
                .thresholdAmount(10000L)
                .discountAmount(2000L)
                .currency("CNY")
                .bearer(CouponBearer.SELLER)
                .validFrom(validFrom)
                .validTo(validTo)
                .totalQuantity(total)
                .issuedQuantity(issued)
                .status(CouponTemplateStatus.ACTIVE)
                .build();
    }

    private CouponTemplate template() {
        return template(now.minusDays(1), now.plusDays(7), 3, 10);
    }

    // 起点闭区间
    @Test
    void 起点当刻_可领() {
        // 「x 点开抢」到点那一刻就该能领：起点是闭区间（CPN-14 的 validFrom <= now）
        assertThat(template(now, now.plusDays(1), 0, 10).claimableAt(now)).isTrue();
    }

    @Test
    void 起点前一秒_不可领但没领完_列表出预告位() {
        var row = ClaimableCouponView.from(template(now.plusSeconds(1), now.plusDays(1), 0, 10), now);

        // 未到起点 ≠ 已领完：两个标记必须分开说，前端据此出「x 点开抢」而不是「已领完」
        assertThat(row.claimable()).isFalse();
        assertThat(row.soldOut()).isFalse();
        assertThat(row.validFrom()).isAfter(now);
    }

    // 终点开区间
    @Test
    void 终点当刻_不可领_结束时刻不留给用户() {
        CouponTemplate ending = template(now.minusDays(7), now, 3, 10);

        assertThat(ending.claimableAt(now)).isFalse();
        assertThat(ending.issuanceEnded(now)).isTrue();
    }

    @Test
    void 终点前一秒_仍可领() {
        assertThat(template(now.minusDays(7), now.plusSeconds(1), 3, 10).claimableAt(now))
                .isTrue();
    }

    // 名额
    @Test
    void 名额差一张_仍可领_最后一格不是已领完() {
        var row = ClaimableCouponView.from(template(now.minusDays(1), now.plusDays(1), 9, 10), now);

        assertThat(row.soldOut()).isFalse();
        assertThat(row.claimable()).isTrue();
    }

    @Test
    void 名额用满_标已领完且不可领_但仍留在列表里() {
        var row = ClaimableCouponView.from(template(now.minusDays(1), now.plusDays(1), 10, 10), now);

        // 领完的券不消失（CPN-13）：消失等于告诉用户「这家店没办活动」
        assertThat(row.soldOut()).isTrue();
        assertThat(row.claimable()).isFalse();
    }

    @Test
    void 读到脏数据_已发数超过总量_同样按领完处理_不给出可领的假承诺() {
        // 条件 UPDATE 让 issued 不可能越过 total，真越了就是别处的 bug；列表此时的职责是不骗人
        assertThat(template(now.minusDays(1), now.plusDays(1), 11, 10).claimableAt(now))
                .isFalse();
    }

    // 默认夹具本身就是可领的（改夹具时别让上面几条在错的前提下变绿）
    @Test
    void 窗口内且有余量_可领() {
        assertThat(template().claimableAt(now)).isTrue();
    }
}
