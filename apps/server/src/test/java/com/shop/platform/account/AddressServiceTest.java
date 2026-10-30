package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.testsupport.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * 地址簿的服务规则：默认地址的唯一性与流转、上限、归属 404、区划码闸门。
 * 每个用例用独立买家，互不清理。
 */
class AddressServiceTest extends IntegrationTest {

    @Autowired
    private AddressService addresses;

    @Test
    void 首条地址自动成为默认() {
        UUID buyer = UUID.randomUUID();
        AddressView first = addresses.create(buyer, request("张三", "440305", null));

        assertThat(first.isDefault()).isTrue();
    }

    @Test
    void 第二条不抢默认_切换默认只留一个() {
        UUID buyer = UUID.randomUUID();
        AddressView a = addresses.create(buyer, request("张三", "440305", null));
        AddressView b = addresses.create(buyer, request("李四", "110105", false));

        assertThat(b.isDefault()).isFalse();
        assertThat(addresses.list(buyer)).first().extracting(AddressView::id).isEqualTo(a.id());

        addresses.setDefault(buyer, b.id());

        assertThat(addresses.detail(buyer, a.id()).isDefault()).isFalse();
        assertThat(addresses.detail(buyer, b.id()).isDefault()).isTrue();
    }

    @Test
    void 取消默认后允许无默认状态() {
        UUID buyer = UUID.randomUUID();
        AddressView a = addresses.create(buyer, request("张三", "440305", null));

        addresses.unsetDefault(buyer, a.id());

        assertThat(addresses.list(buyer))
                .allSatisfy(view -> assertThat(view.isDefault()).isFalse());
    }

    @Test
    void 修改地址内容不动默认位_显式要求时才切换() {
        UUID buyer = UUID.randomUUID();
        AddressView a = addresses.create(buyer, request("张三", "440305", null));
        AddressView b = addresses.create(buyer, request("李四", "110105", false));
        addresses.setDefault(buyer, b.id());

        // 只改内容：默认位保持
        addresses.update(buyer, a.id(), request("张三丰", "440305", null));

        assertThat(addresses.detail(buyer, a.id()).receiverName()).isEqualTo("张三丰");
        assertThat(addresses.detail(buyer, b.id()).isDefault()).isTrue();

        // 显式置默认：切换
        addresses.update(buyer, a.id(), request("张三丰", "440305", true));

        assertThat(addresses.detail(buyer, a.id()).isDefault()).isTrue();
        assertThat(addresses.detail(buyer, b.id()).isDefault()).isFalse();
    }

    @Test
    void 删除后名额释放() {
        UUID buyer = UUID.randomUUID();
        AddressView a = addresses.create(buyer, request("张三", "440305", null));

        addresses.delete(buyer, a.id());

        assertThat(addresses.list(buyer)).isEmpty();
        assertThatThrownBy(() -> addresses.detail(buyer, a.id())).isInstanceOf(BusinessException.class);
    }

    @Test
    void 他人地址一律404防枚举() {
        UUID owner = UUID.randomUUID();
        UUID stranger = UUID.randomUUID();
        AddressView a = addresses.create(owner, request("张三", "440305", null));

        assertThatThrownBy(() -> addresses.detail(stranger, a.id()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));
        assertThatThrownBy(() -> addresses.update(stranger, a.id(), request("李四", "440305", null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));
        assertThatThrownBy(() -> addresses.setDefault(stranger, a.id()))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(404));
    }

    @Test
    void 超过二十条拒绝_错误码带上限参数() {
        UUID buyer = UUID.randomUUID();
        for (int i = 0; i < 20; i++) {
            addresses.create(buyer, request("张三" + i, "440305", null));
        }

        assertThatThrownBy(() -> addresses.create(buyer, request("第二十一条", "440305", null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> {
                    assertThat(e.getCode()).isEqualTo(ErrorCodes.ADDRESS_LIMIT_EXCEEDED);
                    assertThat(e.getParams()).containsEntry("limit", 20);
                });
    }

    @Test
    void 区划码过形状门但不存在_整条拒绝() {
        UUID buyer = UUID.randomUUID();

        assertThatThrownBy(() -> addresses.create(buyer, request("张三", "999999", null)))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                        .isEqualTo(400));
        assertThat(addresses.list(buyer)).isEmpty();
    }

    @Test
    void 手机号归一化入库() {
        UUID buyer = UUID.randomUUID();

        AddressView a = addresses.create(buyer, request("张三", "440305", null, "138-0000)0000"));

        assertThat(a.phone()).isEqualTo("13800000000");
    }

    @Test
    void 三段码由区划码派生() {
        UUID buyer = UUID.randomUUID();
        AddressView a = addresses.create(buyer, request("张三", "440305", null));

        assertThat(a.provinceCode()).isEqualTo("44");
        assertThat(a.cityCode()).isEqualTo("4403");
        assertThat(a.districtCode()).isEqualTo("440305");
    }

    private static AddressRequest request(String receiver, String regionCode, Boolean isDefault) {
        return request(receiver, regionCode, isDefault, "13800000000");
    }

    private static AddressRequest request(String receiver, String regionCode, Boolean isDefault, String phone) {
        return new AddressRequest(
                receiver, phone, regionCode, "广东省", "深圳市", "南山区", "科技园路 1 号 2 栋 301", null, isDefault);
    }
}
