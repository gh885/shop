package com.shop.platform.returns.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import org.junit.jupiter.api.Test;

/** 售后列表的筛选词表校验：词表是库里的 db_value，大小写对不上等于永远筛出空页。 */
class RmaListFilterTest {

    @Test
    void null和合法词表放行() {
        assertThatCode(() -> RmaService.requireKnownType(null)).doesNotThrowAnyException();
        assertThat(RmaService.requireKnownType("refund_only")).isEqualTo("refund_only");
        assertThat(RmaService.requireKnownType("return_refund")).isEqualTo("return_refund");

        assertThatCode(() -> RmaService.requireKnownStatus(null)).doesNotThrowAnyException();
        assertThatCode(() -> RmaService.requireKnownStatus("applied")).doesNotThrowAnyException();
        assertThatCode(() -> RmaService.requireKnownStatus("completed")).doesNotThrowAnyException();
    }

    @Test
    void 大小写不对和未知词回400() {
        assertThatThrownBy(() -> RmaService.requireKnownType("REFUND_ONLY"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("type")
                .extracting(ex -> ((BusinessException) ex).getCode())
                .isNull();

        assertThatThrownBy(() -> RmaService.requireKnownStatus("APPLIED"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("status")
                .extracting(ex -> ((BusinessException) ex).getCode())
                .isNull();
    }
}
