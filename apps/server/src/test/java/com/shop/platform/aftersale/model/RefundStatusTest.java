package com.shop.platform.aftersale.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 退款单状态机规则表测试（docs/domain/order-model.md §4.5）。
 *
 * <p>三条路径共用一套状态：仅退款 / 补偿跳过回寄三态；退货退款必须走完
 * 待寄回 → 已寄回 → 卖家已收货。表失真 = 货没寄回就退钱、或已寄回还能被买家撤销。
 */
class RefundStatusTest {

    @Test
    void 只有待处理能转已同意或已拒绝() {
        assertThat(RefundStatus.sourcesOf(RefundStatus.AGREED)).containsExactly(RefundStatus.PENDING);
        assertThat(RefundStatus.sourcesOf(RefundStatus.REJECTED)).containsExactly(RefundStatus.PENDING);
    }

    @Test
    void 已同意之后按类型分叉_退货走回寄_仅退款直接进退款中() {
        assertThat(RefundStatus.sourcesOf(RefundStatus.RETURN_PENDING)).containsExactly(RefundStatus.AGREED);
        assertThat(RefundStatus.sourcesOf(RefundStatus.REFUNDING))
                .containsExactlyInAnyOrder(RefundStatus.AGREED, RefundStatus.RECEIVED, RefundStatus.FAILED);
    }

    @Test
    void 退货路径单向推进_已寄回只能卖家收货或拦截撤销() {
        assertThat(RefundStatus.sourcesOf(RefundStatus.RETURNED)).containsExactly(RefundStatus.RETURN_PENDING);
        assertThat(RefundStatus.sourcesOf(RefundStatus.RECEIVED)).containsExactly(RefundStatus.RETURNED);
        assertThat(RefundStatus.sourcesOf(RefundStatus.CANCELLED))
                .containsExactlyInAnyOrder(RefundStatus.PENDING, RefundStatus.RETURN_PENDING, RefundStatus.RETURNED);
    }

    @Test
    void 退款中只会确认成功或转失败_失败可重试() {
        assertThat(RefundStatus.sourcesOf(RefundStatus.REFUNDED)).containsExactly(RefundStatus.REFUNDING);
        assertThat(RefundStatus.sourcesOf(RefundStatus.FAILED)).containsExactly(RefundStatus.REFUNDING);
    }

    @Test
    void 未完结集合覆盖六态_失败与三个终态不在内() {
        assertThat(RefundStatus.PENDING.open()).isTrue();
        assertThat(RefundStatus.AGREED.open()).isTrue();
        assertThat(RefundStatus.RETURN_PENDING.open()).isTrue();
        assertThat(RefundStatus.RETURNED.open()).isTrue();
        assertThat(RefundStatus.RECEIVED.open()).isTrue();
        assertThat(RefundStatus.REFUNDING.open()).isTrue();
        // 失败是否仍算未完结取决于重试期，由服务层按重试次数判，不在状态机里一刀切
        assertThat(RefundStatus.FAILED.open()).isFalse();
        assertThat(RefundStatus.REFUNDED.open()).isFalse();
        assertThat(RefundStatus.REJECTED.terminalWithoutMoney()).isTrue();
        assertThat(RefundStatus.CANCELLED.terminalWithoutMoney()).isTrue();
    }
}
