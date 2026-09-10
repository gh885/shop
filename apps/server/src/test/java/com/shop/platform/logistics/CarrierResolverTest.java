package com.shop.platform.logistics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.logistics.mapper.Carrier;
import com.shop.platform.logistics.mapper.CarrierMapper;
import com.shop.platform.logistics.service.CarrierResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 承运商归一（三个入口共用一份口径）：卖家下拉给 code、卖家老端点手填名字、买家回寄可能只有名字。
 *
 * <p>「同一家顺丰五种写法」正是从"每个入口各自处理"长出来的，所以这里逐入口钉死同一套结果。
 */
@ExtendWith(MockitoExtension.class)
class CarrierResolverTest {

    @Mock
    private CarrierMapper carrierMapper;

    @InjectMocks
    private CarrierResolver carrierResolver;

    private static Carrier enabled() {
        return Carrier.builder().code("SF").name("顺丰速运").enabled(true).build();
    }

    @Test
    void 给了code_用字典名_不信任调用方传的名字() {
        when(carrierMapper.selectByCode("SF")).thenReturn(enabled());

        // 调用方同时传了"顺丰"和 code：以字典为准，避免前端文案与字典漂移
        assertThat(carrierResolver.resolveName("SF", "顺丰")).isEqualTo("顺丰速运");
    }

    @Test
    void code不在字典_400() {
        assertThatThrownBy(() -> carrierResolver.resolveName("NOPE", null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }

    @Test
    void code已停用_400() {
        when(carrierMapper.selectByCode("SF"))
                .thenReturn(
                        Carrier.builder().code("SF").name("顺丰速运").enabled(false).build());

        assertThatThrownBy(() -> carrierResolver.resolveName("SF", null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }

    @Test
    void 只有名字且命中字典_归一到字典名() {
        when(carrierMapper.selectByName("顺丰")).thenReturn(enabled());

        assertThat(carrierResolver.resolveName(null, "顺丰")).isEqualTo("顺丰速运");
    }

    @Test
    void 只有名字且未命中字典_保留原文_不因此拒绝发货() {
        when(carrierMapper.selectByName("村口小卖部代收")).thenReturn(null);

        assertThat(carrierResolver.resolveName(null, "村口小卖部代收")).isEqualTo("村口小卖部代收");
    }

    @Test
    void 两者都空_400() {
        assertThatThrownBy(() -> carrierResolver.resolveName(null, "  "))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }
}
