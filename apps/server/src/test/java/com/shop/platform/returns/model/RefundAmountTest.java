package com.shop.platform.returns.model;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * 退款金额的算法。
 *
 * <p>这里只测一件事：<b>怎么退都不会多退，也一定退得完</b>。售后最贵的错就是这两头——
 * 退多了赔钱，退不完留一分钱永远挂账上。
 */
class RefundAmountTest {

    @Test
    void 退一半按比例取整() {
        // 2 件实付 15978.00 元，退 1 件
        assertThat(RefundAmount.of(1_597_800, 2, 1)).isEqualTo(798_900);
    }

    @Test
    void 分两次退完时总额精确等于实付() {
        long payableAmount = 1_597_800;
        long first = RefundAmount.of(payableAmount, 2, 1);
        long second = RefundAmount.of(payableAmount - first, 1, 1);

        assertThat(first + second).isEqualTo(payableAmount);
    }

    @Test
    void 除不尽时尾差留在最后一次而不是丢掉() {
        // 3 件实付 1.00 元：每件 33 分，两次退完剩 34 分给最后一件
        long payableAmount = 100;
        long first = RefundAmount.of(payableAmount, 3, 1);
        long second = RefundAmount.of(payableAmount - first, 2, 1);
        long third = RefundAmount.of(payableAmount - first - second, 1, 1);

        assertThat(first).isEqualTo(33);
        assertThat(second).isEqualTo(33);
        assertThat(third).isEqualTo(34);
        assertThat(first + second + third).isEqualTo(payableAmount);
    }

    @Test
    void 退超过剩余件数直接拒() {
        assertThatThrownBy(() -> RefundAmount.of(100, 1, 2))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("超过剩余可退");
    }

    @Test
    void 已经退完的行再退直接拒() {
        assertThatThrownBy(() -> RefundAmount.of(0, 0, 1))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("已经退完");
    }
}
