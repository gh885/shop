package com.shop.platform.shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.region.RegionRegistry;
import com.shop.platform.shop.dto.MerchantAddressRequest;
import com.shop.platform.shop.mapper.MerchantAddress;
import com.shop.platform.shop.mapper.MerchantAddressMapper;
import com.shop.platform.shop.model.AddressStatus;
import com.shop.platform.shop.service.MerchantAddressService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * 商家地址业务单测（单表「地址本体 + 默认发货/默认退货」模型）：默认唯一、越店 404、软删、默认切换。
 *
 * <p>只测 service 领域可断言行为；区划合法码校验、默认发货快照 join 由真库链路（IT/ControllerTest）覆盖。
 */
@ExtendWith(MockitoExtension.class)
class MerchantAddressServiceTest {

    private final UUID shopId = UUID.randomUUID();
    private final UUID otherShop = UUID.randomUUID();

    @Mock
    private MerchantAddressMapper addressMapper;

    @Mock
    private RegionRegistry regionRegistry;

    @InjectMocks
    private MerchantAddressService addressService;

    private MerchantAddressRequest req(Boolean shipDefault, Boolean returnDefault) {
        return new MerchantAddressRequest(
                "陈仓",
                "13800138000",
                "440305",
                "广东省",
                "深圳市",
                "南山区",
                "科技园1号",
                "518000",
                "深圳店铺",
                "主营仓",
                shipDefault,
                returnDefault);
    }

    // ---- create：标记默认发货会先清本店其他默认发货，保证每店至多一个 ----

    @Test
    void create_withDefaultShip_clearsSameShopDefaultShipBeforeInsert() {
        when(regionRegistry.isValidCode("440305")).thenReturn(true);

        MerchantAddress created = addressService.create(shopId, req(true, false));

        verify(addressMapper).clearDefaultShip(shopId);
        verify(addressMapper).insert(org.mockito.ArgumentMatchers.any(MerchantAddress.class));
        assertThat(created.getShopId()).isEqualTo(shopId);
        assertThat(created.getDefaultShip()).isTrue();
        assertThat(created.getDefaultReturn()).isFalse();
        assertThat(created.getStatus()).isEqualTo(AddressStatus.ACTIVE);
    }

    // ---- create：区划非国标码直接 400 ----

    @Test
    void create_withInvalidRegionCode_throwsBadRequest() {
        when(regionRegistry.isValidCode("999999")).thenReturn(false);
        MerchantAddressRequest invalid = new MerchantAddressRequest(
                "陈仓", "13800138000", "999999", "广东省", "深圳市", "南山区", "科技园1号", "518000", "深圳店铺", null, false, false);

        assertThatThrownBy(() -> addressService.create(shopId, invalid))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(400);
    }

    // ---- update：越店访问一律 404（不暴露他人地址存在性） ----

    @Test
    void update_whenAddressBelongsToOtherShop_throwsNotFound() {
        when(regionRegistry.isValidCode("440305")).thenReturn(true);
        UUID addrId = UUID.randomUUID();
        when(addressMapper.selectById(addrId))
                .thenReturn(
                        MerchantAddress.builder().id(addrId).shopId(otherShop).build());

        assertThatThrownBy(() -> addressService.update(shopId, addrId, req(false, false)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getHttpStatus())
                .isEqualTo(404);
    }

    // ---- setDefaultShip：置默认前清本店其他默认发货，并发布默认切换事件 ----

    @Test
    void setDefaultShip_clearsShopDefaultShip_andPublishesSwitchedEvent() {
        UUID addrId = UUID.randomUUID();
        MerchantAddress address = MerchantAddress.builder()
                .id(addrId)
                .shopId(shopId)
                .defaultShip(false)
                .defaultReturn(false)
                .status(AddressStatus.ACTIVE)
                .build();
        when(addressMapper.selectById(addrId)).thenReturn(address);

        addressService.setDefaultShip(shopId, addrId);

        verify(addressMapper).clearDefaultShip(shopId);
        verify(addressMapper).updateById(address);
        assertThat(address.getDefaultShip()).isTrue();
    }

    // ---- delete：软删，api 快照解析永不命中 ----

    @Test
    void delete_softDeletesAddress() {
        UUID addrId = UUID.randomUUID();
        MerchantAddress address = MerchantAddress.builder()
                .id(addrId)
                .shopId(shopId)
                .status(AddressStatus.ACTIVE)
                .build();
        when(addressMapper.selectById(addrId)).thenReturn(address);

        addressService.delete(shopId, addrId);

        verify(addressMapper).deleteById(addrId);
    }
}
