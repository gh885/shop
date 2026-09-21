package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class PhoneNumberTest {

    @Test
    void 归一化去杂讯() {
        assertThat(PhoneNumber.of("138 0000 0000").value()).isEqualTo("13800000000");
        assertThat(PhoneNumber.of("138-0000-0000").value()).isEqualTo("13800000000");
        assertThat(PhoneNumber.of("(138)0000 0000").value()).isEqualTo("13800000000");
    }

    @Test
    void 非法手机号被拒绝() {
        assertThatThrownBy(() -> PhoneNumber.of("abc")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PhoneNumber.of("")).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PhoneNumber.of(null)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PhoneNumber.of("123")).isInstanceOf(BusinessException.class);
    }

    @Test
    void 脱敏展示() {
        assertThat(PhoneNumber.of("13812345678").masked()).isEqualTo("138****5678");
    }
}
