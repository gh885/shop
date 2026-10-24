package com.shop.platform.trade.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import org.junit.jupiter.api.Test;

/** 订单列表的筛选词表校验：筛错词当场 400，不能放进去变成永远空页。 */
class BuyerOrderQueryStatusTest {

    @Test
    void null和全部展示态都放行() {
        assertThatCode(() -> BuyerOrderQuery.requireKnownStatus(null)).doesNotThrowAnyException();
        for (String status :
                new String[] {"pending_payment", "paid", "partially_refunded", "refunded", "cancelled", "closed"}) {
            assertThatCode(() -> BuyerOrderQuery.requireKnownStatus(status)).doesNotThrowAnyException();
        }
    }

    @Test
    void 未知状态回400() {
        assertThatThrownBy(() -> BuyerOrderQuery.requireKnownStatus("done"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("status")
                .extracting(ex -> ((BusinessException) ex).getCode())
                .isNull();
    }
}
