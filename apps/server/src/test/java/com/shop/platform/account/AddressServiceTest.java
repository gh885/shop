package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.mapper.Address;
import com.shop.platform.account.mapper.AddressMapper;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.region.RegionRegistry;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;

/**
 * 买家收货地址业务单测（Mockito，不碰库）：新增条数上限闸门；设默认撞唯一索引折 409。
 *
 * <p>默认唯一 / 越权 404 由 AddressDefaultIT（真库）覆盖，这里只补上限闸门与 409 折算这两条。
 */
@ExtendWith(MockitoExtension.class)
class AddressServiceTest {

    private final UUID userId = UUID.randomUUID();

    @Mock
    private AddressMapper addressMapper;

    @Mock
    private RegionRegistry regionRegistry;

    @InjectMocks
    private AddressService addressService;

    private AddressRequest req() {
        return new AddressRequest("张三", "13800000000", "110105", "北京市", "北京市", "朝阳区", "测试路 1 号", "HOME", false);
    }

    @Test
    void 新增地址_已有条数未达上限_放行() {
        when(addressMapper.countByUser(userId)).thenReturn(19L);

        AddressView created = addressService.create(userId, req());

        assertThat(created.userId()).isEqualTo(userId);
        verify(addressMapper).insert(any(Address.class));
    }

    @Test
    void 新增地址_已有条数已达上限20_拒绝() {
        when(addressMapper.countByUser(userId)).thenReturn(20L);

        assertThatThrownBy(() -> addressService.create(userId, req()))
                .isInstanceOf(BusinessException.class)
                .matches(e -> ((BusinessException) e).getHttpStatus() == 400
                        && "ADDRESS_LIMIT_EXCEEDED".equals(((BusinessException) e).getCode())
                        // 上限作为数据出（前端 catalog 句子的 {limit} 靠它填）：只断言错会静默地退回
                        // 「前端解析 detail 里的数字」，而那条路英文界面上根本用不了
                        && Integer.valueOf(20)
                                .equals(((BusinessException) e).getParams().get("limit")));
        verify(addressMapper, never()).insert(any(Address.class));
    }

    /**
     * 两个请求同时设默认：各自清掉旧默认再各置一个新的（写偏斜），第二个撞部分唯一索引 uk_addresses_default。
     * 撞键必须折成 409——GlobalExceptionHandler 不映射 DuplicateKeyException，不折就是 500。
     * 置真走的是 setDefaultFlag 条件更新（is_default 标了 NEVER，整行回写写不进它），撞键就撞在这一句上。
     */
    @Test
    void 设默认地址_撞唯一索引_409而非500() {
        UUID id = UUID.randomUUID();
        when(addressMapper.selectById(id))
                .thenReturn(Address.builder().userId(userId).isDefault(false).build());
        when(addressMapper.setDefaultFlag(eq(userId), eq(id), eq(true), any()))
                .thenThrow(new DuplicateKeyException("uk_addresses_default"));

        assertThatThrownBy(() -> addressService.setDefault(userId, id))
                .isInstanceOf(BusinessException.class)
                .matches(e -> ((BusinessException) e).getHttpStatus() == 409);
        verify(addressMapper, never()).updateById(any(Address.class));
    }
}
