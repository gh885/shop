package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class MoneyTest {

    @Test
    void cny构造默认人民币分单位() {
        assertThat(Money.cny(29900).amount()).isEqualTo(29900);
        assertThat(Money.cny(29900).currency()).isEqualTo("CNY");
    }

    @Test
    void 同币种相加() {
        assertThat(Money.cny(100).plus(Money.cny(50))).isEqualTo(Money.cny(150));
    }

    @Test
    void 跨币种相加被拒绝() {
        assertThatThrownBy(() -> Money.cny(100).plus(Money.ofFen(100, "USD")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("币种不一致");
    }

    @Test
    void 乘以非负整数() {
        assertThat(Money.cny(100).times(3)).isEqualTo(Money.cny(300));
        assertThatThrownBy(() -> Money.cny(100).times(-1)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 运算溢出不能静默变成负金额() {
        assertThatThrownBy(() -> Money.cny(Long.MAX_VALUE).plus(Money.cny(1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("溢出");
        assertThatThrownBy(() -> Money.cny(Long.MAX_VALUE).times(2))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("溢出");
    }

    @Test
    void 负数金额与空币种被拒绝() {
        assertThatThrownBy(() -> new Money(-1, "CNY")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new Money(1, "  ")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 内部运算破坏金额不变量时按服务端错误暴露() {
        assertThatThrownBy(() -> Money.cny(100).minus(Money.cny(101))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> Money.cny(100).atLeast(Money.ofFen(100, "USD")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 入参币种不受支持时仍是客户端错误() {
        assertThatThrownBy(() -> Money.ofFen(100, "USD").requirePlatformCurrency())
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 币种归一化为大写() {
        assertThat(Money.ofFen(100, "cny").currency()).isEqualTo("CNY");
    }
}
