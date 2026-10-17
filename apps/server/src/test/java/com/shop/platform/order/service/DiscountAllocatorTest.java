package com.shop.platform.order.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 分摊算法（docs/domain/order-model.md §6.1）：两个例子是规则的原文，直接当断言。
 *
 * <p>纯函数不漏到库：金额都是整数分，余数归行序号最大的行，且不得把某行补成负实付。
 */
class DiscountAllocatorTest {

    /** 例 1：定向券被行金额封顶，余量作废，不能挪给别的行 */
    @Test
    void 例1_定向券超过行金额_只用到上限_余量作废() {
        DiscountAllocator.Targeted targeted = DiscountAllocator.applyTargeted(40, 50);

        assertThat(targeted.applied()).isEqualTo(40);
        assertThat(targeted.wasted()).isEqualTo(10);
    }

    /** 例 2：兜底池 80、两行额度 40 + 30 = 70，摊不完 ⇒ 结算拒绝 */
    @Test
    void 例2_兜底池大于全部行额度_拒绝下单() {
        assertThatThrownBy(() -> DiscountAllocator.allocateDiscount(80, List.of(40L, 30L)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("超过");
    }

    @Test
    void 兜底池按占比分摊_余数归末行() {
        // 10 / 70：40 占比 5.71 → 5，30 占比 4.28 → 4，余 1 补末行
        assertThat(DiscountAllocator.allocateDiscount(10, List.of(40L, 30L))).containsExactly(5, 5);
        // 刚好摊满：40 + 30
        assertThat(DiscountAllocator.allocateDiscount(70, List.of(40L, 30L))).containsExactly(40, 30);
    }

    @Test
    void 余数只能补到还有额度的行_不越过行金额() {
        // 2 分摊三行各 1 分：floor 全 0，余 2 从末行往前补，每行最多补 1
        assertThat(DiscountAllocator.allocateDiscount(2, List.of(1L, 1L, 1L))).containsExactly(0, 1, 1);
    }

    @Test
    void 运费按占比分摊_不设行金额上限() {
        assertThat(DiscountAllocator.allocateShipping(100, List.of(1L, 2L))).containsExactly(33, 67);
        assertThat(DiscountAllocator.allocateShipping(0, List.of(10L, 20L))).containsExactly(0, 0);
    }

    @Test
    void 非法输入_拒绝() {
        assertThatThrownBy(() -> DiscountAllocator.allocateDiscount(-1, List.of(10L)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DiscountAllocator.allocateDiscount(10, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> DiscountAllocator.allocateShipping(-1, List.of(10L)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
