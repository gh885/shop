package com.shop.platform.account;

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

import com.shop.platform.account.service.AddressView;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 地址簿接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：创建语义（201）、软删（204）、鉴权守卫（401）、请求入参校验（422）、出参不吐软删标记
 * deletedAt（absence）、路由与参数绑定（verify）。智能粘贴解析与默认置顶归 service；响应形状由 OpenAPI→SDK 钉死。
 */
class AddressControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID addressId = UUID.randomUUID();

    private AddressView address() {
        return new AddressView(
                addressId,
                userId,
                "张三",
                "13800000000",
                "110100",
                "北京市",
                "北京市",
                "朝阳区",
                "测试路 1 号",
                "HOME",
                true,
                OffsetDateTime.now(),
                OffsetDateTime.now());
    }

    @Nested
    class 新增 { // POST /user/addresses

        @Test
        void 成功_201_不泄漏软删标记() throws Exception {
            when(addressService.create(eq(userId), any())).thenReturn(address());

            mockMvc.perform(
                            post("/user/addresses")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"receiverName": "张三", "phone": "13800000000", "regionCode": "110100",
                                 "province": "北京市", "city": "北京市", "district": "朝阳区", "detail": "测试路 1 号"}
                                """))
                    .andExpect(status().isCreated())
                    // 契约回归：软删标记是存储内部状态，禁止越过 HTTP 边界
                    .andExpect(jsonPath("$.deletedAt").doesNotExist());

            verify(addressService).create(eq(userId), any());
        }

        @Test
        void 手机号非法_422() throws Exception {
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
    }

    @Nested
    class 智能粘贴 { // POST /user/addresses/parse

        @Test
        void 解析_透传() throws Exception {
            String text = "张三 13800000000 北京市朝阳区测试路1号";
            when(addressService.parse(text))
                    .thenReturn(new com.shop.platform.account.service.AddressParseResult(
                            "张三", "13800000000", "110100", "北京市", "北京市", "朝阳区", "测试路1号"));

            mockMvc.perform(post("/user/addresses/parse")
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"text": "%s"}
                                """
                                            .formatted(text)))
                    .andExpect(status().isOk());

            verify(addressService).parse(text);
        }
    }

    @Nested
    class 地址详情 { // GET /user/addresses/{id}

        @Test
        void 结算页反显() throws Exception {
            when(addressService.detail(userId, addressId)).thenReturn(address());

            mockMvc.perform(get("/user/addresses/{id}", addressId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(addressService).detail(userId, addressId);
        }
    }

    @Nested
    class 地址列表 { // GET /user/addresses

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/user/addresses")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 改地址 { // PUT /user/addresses/{id}

        @Test
        void 全量更新() throws Exception {
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
    }

    @Nested
    class 删除 { // DELETE /user/addresses/{id}

        @Test
        void 软删_204() throws Exception {
            mockMvc.perform(delete("/user/addresses/{id}", addressId).with(userAuth(userId)))
                    .andExpect(status().isNoContent());

            verify(addressService).delete(userId, addressId);
        }
    }

    @Nested
    class 默认地址 { // PUT/DELETE /user/addresses/{id}/default

        @Test
        void 设默认与取消() throws Exception {
            when(addressService.setDefault(userId, addressId)).thenReturn(address());
            when(addressService.unsetDefault(userId, addressId)).thenReturn(address());

            mockMvc.perform(put("/user/addresses/{id}/default", addressId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            mockMvc.perform(delete("/user/addresses/{id}/default", addressId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(addressService).setDefault(userId, addressId);
            verify(addressService).unsetDefault(userId, addressId);
        }
    }
}
