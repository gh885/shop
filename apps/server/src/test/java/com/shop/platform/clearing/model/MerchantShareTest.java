package com.shop.platform.clearing.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 退款换算成"商家承担多少"。
 *
 * <p>这几条守的是一件事：<b>买家退的是 payable，商家损失的是 net，中间差一个佣金。</b>
 * 直接拿退款额去减净额，商家就被多扣了佣金那部分——这个 bug 不会报错，只会让每个退过款的商家
 * 少收几块钱，而且要靠人拿计算器对才发现。
 */
class MerchantShareTest {

    /** 一单 iPhone：应付 7979.00、佣金 5% 399.95、商家净额 7579.05。 */
    private static final long PAYABLE = 797_900;

    private static final long NET = 757_905;

    @Test
    @DisplayName("退满：商家承担全部净额，不是全部应付")
    void fullRefundTakesNetNotPayable() {
        assertThat(MerchantShare.of(PAYABLE, NET, PAYABLE)).isEqualTo(NET);
    }

    @Test
    @DisplayName("退一半：按 net:payable 拆，商家不承担佣金那半")
    void halfRefundSplitsByNetRatio() {
        long share = MerchantShare.of(PAYABLE / 2, NET, PAYABLE);

        assertThat(share).isEqualTo(378_952);
        // 拿退款额直接当商家承担，会多扣 39998 分（半个佣金）
        assertThat(share).isLessThan(PAYABLE / 2);
    }

    @Test
    @DisplayName("分两次退完：两次增量之和精确等于净额，不留零头")
    void incrementsSumExactlyToNet() {
        long first = MerchantShare.increment(0, PAYABLE / 2, NET, PAYABLE);
        long second = MerchantShare.increment(PAYABLE / 2, PAYABLE - PAYABLE / 2, NET, PAYABLE);

        assertThat(first).isEqualTo(378_952);
        assertThat(second).isEqualTo(378_953);
        assertThat(first + second).isEqualTo(NET);
    }

    @Test
    @DisplayName("分三次退：增量之和仍然等于净额")
    void incrementsSumExactlyAcrossThreeParts() {
        long part = PAYABLE / 3;
        long first = MerchantShare.increment(0, part, NET, PAYABLE);
        long second = MerchantShare.increment(part, part, NET, PAYABLE);
        long third = MerchantShare.increment(part * 2, PAYABLE - part * 2, NET, PAYABLE);

        assertThat(first + second + third).isEqualTo(NET);
    }

    @Test
    @DisplayName("退 0：不承担")
    void zeroRefundTakesNothing() {
        assertThat(MerchantShare.of(0, NET, PAYABLE)).isZero();
        assertThat(MerchantShare.increment(0, 0, NET, PAYABLE)).isZero();
    }

    @Test
    @DisplayName("超额退款：最多承担到净额，不会把商家扣成负数")
    void overRefundCapsAtNet() {
        assertThat(MerchantShare.of(PAYABLE * 2, NET, PAYABLE)).isEqualTo(NET);
    }

    @Test
    @DisplayName("没有应付：比例无从谈起，退款额全算商家的")
    void noPayableFallsBackToRefundAmount() {
        assertThat(MerchantShare.of(500, 0, 0)).isEqualTo(500);
    }
}
