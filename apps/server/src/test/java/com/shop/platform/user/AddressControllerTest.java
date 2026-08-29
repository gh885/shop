package com.shop.platform.user;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.testsupport.WebControllerTestSupport;
import com.shop.platform.user.mapper.Address;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 地址簿接口契约：CRUD + 智能粘贴 + 默认地址开关。
 * 关键契约回归：出参不吐 deletedAt 软删标记（曾因此泄漏，见 AGENTS.md 命名规范案例）。
 */
class AddressControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID addressId = UUID.randomUUID();

    private Address address() {
        Address a = new Address();
        a.setId(addressId);
        a.setUserId(userId);
        a.setReceiverName("张三");
        a.setPhone("13800000000");
        a.setRegionCode("110100");
        a.setProvince("北京市");
        a.setCity("北京市");
        a.setDistrict("朝阳区");
        a.setDetail("测试路 1 号");
        a.setLabel("HOME");
        a.setIsDefault(true);
        a.setCreatedAt(OffsetDateTime.now());
        a.setUpdatedAt(OffsetDateTime.now());
        return a;
    }

    @Test
    void 新增地址_201_回显且不泄漏软删标记() throws Exception {
        when(addressService.create(eq(userId), any())).thenReturn(address());

        mockMvc.perform(
                        post("/user/addresses")
                                .with(userAuth(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {
                              "receiverName": "张三",
                              "phone": "13800000000",
                              "regionCode": "110100",
                              "province": "北京市",
                              "city": "北京市",
                              "district": "朝阳区",
                              "detail": "测试路 1 号"
                            }
                            """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.receiverName").value("张三"))
                .andExpect(jsonPath("$.isDefault").value(true))
                // 契约回归：软删标记是存储内部状态，禁止越过 HTTP 边界
                .andExpect(jsonPath("$.deletedAt").doesNotExist());
    }

    @Test
    void 新增地址_手机号非法_422() throws Exception {
        mockMvc.perform(
                        post("/user/addresses")
                                .with(userAuth(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {"receiverName": "张三", "phone": "abc", "regionCode": "110100",
                             "province": "北京市", "city": "北京市", "district": "朝阳区", "detail": "x"}
                            """))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("phone"));
    }

    @Test
    void 智能粘贴_文本解析不入库() throws Exception {
        String text = "张三 13800000000 北京市朝阳区测试路1号";
        when(addressService.parse(text))
                .thenReturn(new com.shop.platform.user.service.AddressParseResult(
                        "张三", "13800000000", "110100", "北京市", "北京市", "朝阳区", "测试路1号"));

        mockMvc.perform(post("/user/addresses/parse")
                        .with(userAuth(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"text": "%s"}
                            """
                                .formatted(text)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.receiverName").value("张三"))
                .andExpect(jsonPath("$.regionCode").value("110100"));

        verify(addressService).parse(text);
    }

    @Test
    void 地址列表_默认置顶由service保证() throws Exception {
        when(addressService.list(userId)).thenReturn(List.of(address()));

        mockMvc.perform(get("/user/addresses").with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(addressId.toString()));
    }

    @Test
    void 地址详情_结算页反显() throws Exception {
        when(addressService.detail(userId, addressId)).thenReturn(address());

        mockMvc.perform(get("/user/addresses/{id}", addressId).with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.district").value("朝阳区"));

        verify(addressService).detail(userId, addressId);
    }

    @Test
    void 改地址_全量更新() throws Exception {
        when(addressService.update(eq(userId), eq(addressId), any())).thenReturn(address());

        mockMvc.perform(
                        put("/user/addresses/{id}", addressId)
                                .with(userAuth(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {"receiverName": "李四", "phone": "13900000000", "regionCode": "310100",
                             "province": "浙江省", "city": "杭州市", "district": "西湖区", "detail": "新路 2 号"}
                            """))
                .andExpect(status().isOk());

        verify(addressService).update(eq(userId), eq(addressId), any());
    }

    @Test
    void 删地址_204软删() throws Exception {
        mockMvc.perform(delete("/user/addresses/{id}", addressId).with(userAuth(userId)))
                .andExpect(status().isNoContent());

        verify(addressService).delete(userId, addressId);
    }

    @Test
    void 设默认与取消默认_都返回当前地址() throws Exception {
        when(addressService.setDefault(userId, addressId)).thenReturn(address());
        when(addressService.unsetDefault(userId, addressId)).thenReturn(address());

        mockMvc.perform(put("/user/addresses/{id}/default", addressId).with(userAuth(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(true));

        mockMvc.perform(delete("/user/addresses/{id}/default", addressId).with(userAuth(userId)))
                .andExpect(status().isOk());

        verify(addressService).setDefault(userId, addressId);
        verify(addressService).unsetDefault(userId, addressId);
    }

    @Test
    void 未登录_401() throws Exception {
        mockMvc.perform(get("/user/addresses")).andExpect(status().isUnauthorized());
    }
}
