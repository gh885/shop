package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * 手机号值对象与掩码出口。掩码是 PII 的唯一出口（日志/展示同源），边界错了等于没脱敏。
 */
class PhoneNumberTest {

    @Test
    void ofNormalizesNoiseAndRejectsGarbage() {
        assertThat(PhoneNumber.of(" 138-0000.0000 ").value()).isEqualTo("13800000000");
        assertThat(PhoneNumber.of("+8613800000000").value()).isEqualTo("+8613800000000");

        assertThatThrownBy(() -> PhoneNumber.of(null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PhoneNumber.of("138abc0000")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PhoneNumber.of("138")).isInstanceOf(BusinessException.class);
    }

    @Test
    void maskKeepsHeadAndTailOnly() {
        assertThat(PhoneNumber.mask("13800000000")).isEqualTo("138****0000");
        assertThat(PhoneNumber.mask("+8613800000000")).isEqualTo("+86****0000");
    }

    @Test
    void maskNeverLeaksShortValues() {
        // 短串不掏前 3 后 4（那等于原样返回），一律整体掩掉
        assertThat(PhoneNumber.mask(null)).isEqualTo("******");
        assertThat(PhoneNumber.mask("")).isEqualTo("******");
        assertThat(PhoneNumber.mask("1234567")).isEqualTo("******");
    }
}
