package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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

/**
 * 买家收货地址业务单测（Mockito，不碰库）：新增条数上限闸门。
 *
 * <p>默认唯一 / 越权 404 由 AddressDefaultIT（真库）覆盖，这里只补上限这条新闸门。
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
                        && "ADDRESS_LIMIT_EXCEEDED".equals(((BusinessException) e).getCode()));
        verify(addressMapper, never()).insert(any(Address.class));
    }
}
