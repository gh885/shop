package com.shop.platform.shop;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.shop.dto.MerchantAddressRequest;
import com.shop.platform.shop.mapper.MerchantAddress;
import com.shop.platform.shop.model.AddressStatus;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 商家收货地址接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：X-Shop-Id 成员过滤器守卫（缺头 403）、入参校验（422）、创建/软删语义（201/204）、
 * 出参不吐软删标记 deletedAt（absence）、路由与参数绑定（verify 落到 shopId 与路径变量）。
 * 「默认发货/退货各自至多一条」的唯一性归 MerchantAddressServiceTest 与真库链路；
 * 响应形状由 OpenAPI→SDK 钉死。
 */
class SellerAddressControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private final UUID addressId = UUID.randomUUID();

    @BeforeEach
    void stubMembership() {
        stubSellerMembership();
    }

    private MerchantAddress address() {
        return MerchantAddress.builder()
                .id(addressId)
                .shopId(shopId)
                .contactName("发货员")
                .phone("13800000000")
                .regionCode("330106")
                .province("浙江省")
                .city("杭州市")
                .district("西湖区")
                .detail("文一西路 969 号")
                .companyName("某某公司")
                .defaultShip(true)
                .defaultReturn(false)
                .status(AddressStatus.ACTIVE)
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();
    }

    private static final String VALID_BODY =
            """
            {"contactName": "发货员", "phone": "13800000000", "regionCode": "330106",
             "province": "浙江省", "city": "杭州市", "district": "西湖区", "detail": "文一西路 969 号"}
            """;

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder seller(
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder) {
        return builder.with(userAuth(userId)).header("X-Shop-Id", shopId.toString());
    }

    @Nested
    class 地址列表 { // GET /seller/addresses

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/seller/addresses")).andExpect(status().isUnauthorized());
        }

        @Test
        void 缺店铺上下文_403() throws Exception {
            mockMvc.perform(get("/seller/addresses").with(userAuth(userId))).andExpect(status().isForbidden());
        }

        @Test
        void 成员_200_店铺上下文绑到service() throws Exception {
            when(merchantAddressService.list(shopId)).thenReturn(List.of(address()));

            mockMvc.perform(seller(get("/seller/addresses"))).andExpect(status().isOk());

            verify(merchantAddressService).list(shopId);
        }
    }

    @Nested
    class 新增地址 { // POST /seller/addresses

        @Test
        void 缺联系人_422() throws Exception {
            mockMvc.perform(
                            seller(post("/seller/addresses"))
                                    .content(
                                            """
                                    {"phone": "13800000000", "regionCode": "330106", "province": "浙江省",
                                     "city": "杭州市", "detail": "文一西路 969 号"}
                                    """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("contactName"));
        }

        @Test
        void 手机号格式非法_422() throws Exception {
            mockMvc.perform(seller(post("/seller/addresses")).content(VALID_BODY.replace("13800000000", "abc")))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("phone"));
        }

        @Test
        void 区划码非六位数字_422() throws Exception {
            mockMvc.perform(seller(post("/seller/addresses")).content(VALID_BODY.replace("330106", "33010")))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("regionCode"));
        }

        @Test
        void 合法body_201_不吐软删标记_店铺与入参透传() throws Exception {
            when(merchantAddressService.create(eq(shopId), any())).thenReturn(address());

            mockMvc.perform(seller(post("/seller/addresses")).content(VALID_BODY))
                    .andExpect(status().isCreated())
                    // 软删标记是存储内部状态，禁止越过 HTTP 边界
                    .andExpect(jsonPath("$.deletedAt").doesNotExist());

            ArgumentCaptor<MerchantAddressRequest> captured = ArgumentCaptor.forClass(MerchantAddressRequest.class);
            verify(merchantAddressService).create(eq(shopId), captured.capture());
            assertEquals("发货员", captured.getValue().contactName());
            assertEquals("杭州市", captured.getValue().city());
        }
    }

    @Nested
    class 地址详情 { // GET /seller/addresses/{id}

        @Test
        void 路径变量与店铺上下文透传() throws Exception {
            when(merchantAddressService.detail(shopId, addressId)).thenReturn(address());

            mockMvc.perform(seller(get("/seller/addresses/{id}", addressId))).andExpect(status().isOk());

            verify(merchantAddressService).detail(shopId, addressId);
        }
    }

    @Nested
    class 编辑地址 { // PUT /seller/addresses/{id}

        @Test
        void 路径变量与店铺上下文透传() throws Exception {
            when(merchantAddressService.update(eq(shopId), eq(addressId), any()))
                    .thenReturn(address());

            mockMvc.perform(seller(put("/seller/addresses/{id}", addressId)).content(VALID_BODY))
                    .andExpect(status().isOk());

            verify(merchantAddressService).update(eq(shopId), eq(addressId), any());
        }

        @Test
        void 缺必填_422() throws Exception {
            mockMvc.perform(seller(put("/seller/addresses/{id}", addressId)).content("{}"))
                    .andExpect(status().is(422));
        }
    }

    @Nested
    class 删除地址 { // DELETE /seller/addresses/{id}

        @Test
        void 软删_204() throws Exception {
            mockMvc.perform(seller(delete("/seller/addresses/{id}", addressId))).andExpect(status().isNoContent());

            verify(merchantAddressService).delete(shopId, addressId);
        }
    }

    @Nested
    class 默认用途 { // PUT /seller/addresses/{id}/default-ship|default-return

        @Test
        void 设默认发货与默认退货_各自绑定路径与店铺() throws Exception {
            when(merchantAddressService.setDefaultShip(shopId, addressId)).thenReturn(address());
            when(merchantAddressService.setDefaultReturn(shopId, addressId)).thenReturn(address());

            mockMvc.perform(seller(put("/seller/addresses/{id}/default-ship", addressId)))
                    .andExpect(status().isOk());
            mockMvc.perform(seller(put("/seller/addresses/{id}/default-return", addressId)))
                    .andExpect(status().isOk());

            verify(merchantAddressService).setDefaultShip(shopId, addressId);
            verify(merchantAddressService).setDefaultReturn(shopId, addressId);
        }
    }
}
