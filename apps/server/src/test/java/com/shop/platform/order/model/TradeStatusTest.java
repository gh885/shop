package com.shop.platform.order.model;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * 主订单状态机规则表测试：待支付 → 已支付 → 已关闭。
 *
 * <p>这张表是收银台与关单条件更新的唯一前置集来源，失真 = 已关闭的单还能被支付、或已支付的单被超时任务再次关掉。
 */
class TradeStatusTest {

    @Test
    void 只有待支付能转已支付() {
        assertThat(TradeStatus.sourcesOf(TradeStatus.PAID)).containsExactly(TradeStatus.PENDING_PAYMENT);
    }

    @Test
    void 待支付与已支付都能关单() {
        assertThat(TradeStatus.sourcesOf(TradeStatus.CLOSED))
                .containsExactlyInAnyOrder(TradeStatus.PENDING_PAYMENT, TradeStatus.PAID);
    }

    @Test
    void 已关闭是终态_不再参与任何转移() {
        assertThat(TradeStatus.CLOSED.terminal()).isTrue();
        assertThat(TradeStatus.PENDING_PAYMENT.terminal()).isFalse();
        assertThat(TradeStatus.PAID.terminal()).isFalse();
    }
}
