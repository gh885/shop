package com.shop.platform.shop;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.model.ShopStatus;
import com.shop.platform.shop.service.SubaccountItem;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 店铺管理接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：鉴权守卫（401）、请求入参校验（422）、路由与参数绑定（verify）。
 * 开店入队审核的事件链路、成员跨 schema 拼装、邀请码权限模型归 service/ShopGovernanceIT；
 * 响应形状由 OpenAPI→SDK 钉死。
 */
class ShopControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    private Shop shop(ShopStatus status) {
        Shop s = new Shop();
        s.setId(shopId);
        s.setOwnerId(userId);
        s.setName("测试店铺");
        s.setStatus(status);
        s.setCreatedAt(OffsetDateTime.now());
        s.setUpdatedAt(OffsetDateTime.now());
        return s;
    }

    @Nested
    class 我的店铺 { // GET /shops/mine

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/shops/mine")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 重新提交审核 { // POST /shops/{shopId}/resubmit

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(
                            post("/shops/" + shopId + "/resubmit")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": "改了名的店"}
                                """))
                    .andExpect(status().isUnauthorized());
        }

        /** 路径上的 shopId 与登录者一起递到 service，店名与 logo 原样透传（logo 可缺省 = 不改） */
        @Test
        void 绑定店铺与操作者() throws Exception {
            when(shopService.resubmitReview(eq(shopId), eq(userId), eq("改了名的店"), isNull()))
                    .thenReturn(shop(ShopStatus.PENDING_REVIEW));

            mockMvc.perform(
                            post("/shops/" + shopId + "/resubmit")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": "改了名的店"}
                                """))
                    .andExpect(status().isOk());

            verify(shopService).resubmitReview(eq(shopId), eq(userId), eq("改了名的店"), isNull());
        }

        @Test
        void 空店名_422() throws Exception {
            mockMvc.perform(
                            post("/shops/" + shopId + "/resubmit")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": ""}
                                """))
                    .andExpect(status().is(422));
        }

        /** 非被驳回的店重提 → 409（原话由 service 给，接口只负责把状态码带出去） */
        @Test
        void 店铺不是在审状态_409() throws Exception {
            when(shopService.resubmitReview(eq(shopId), eq(userId), eq("随便"), isNull()))
                    .thenThrow(BusinessException.conflict(null, "只有审核未通过的店铺可以重新提交"));

            mockMvc.perform(
                            post("/shops/" + shopId + "/resubmit")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": "随便"}
                                """))
                    .andExpect(status().isConflict());
        }
    }

    @Nested
    class 开店 { // POST /shops

        @Test
        void 落待审核状态() throws Exception {
            when(shopService.createShop(eq(userId), eq("新店铺"), isNull())).thenReturn(shop(ShopStatus.PENDING_REVIEW));

            mockMvc.perform(
                            post("/shops")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": "新店铺"}
                                """))
                    .andExpect(status().isCreated());

            verify(shopService).createShop(eq(userId), eq("新店铺"), isNull());
        }

        @Test
        void 空名_422() throws Exception {
            mockMvc.perform(
                            post("/shops")
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"name": ""}
                                """))
                    .andExpect(status().is(422));
        }
    }

    @Nested
    class 建子账号 { // POST /shops/{shopId}/subaccounts

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/shops/{shopId}/subaccounts", shopId).contentType(MediaType.APPLICATION_JSON))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 登录名与手机号绑定到当前店主与路径店() throws Exception {
            when(shopSubaccountService.create(
                            eq(shopId), eq(userId), eq("kefu01"), eq("13800138000"), eq("Password123"), eq(null)))
                    .thenReturn(subaccountItem("PENDING_ACTIVATION"));

            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"loginName": "kefu01", "phone": "13800138000", "password": "Password123"}
                                """))
                    .andExpect(status().isCreated());

            verify(shopSubaccountService)
                    .create(eq(shopId), eq(userId), eq("kefu01"), eq("13800138000"), eq("Password123"), eq(null));
        }

        @Test
        void 携带权限码_透传到service() throws Exception {
            when(shopSubaccountService.create(
                            eq(shopId),
                            eq(userId),
                            eq("kefu01"),
                            eq("13800138000"),
                            eq("Password123"),
                            eq(List.of("ORDER_FULFILL"))))
                    .thenReturn(subaccountItem("PENDING_ACTIVATION"));

            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"loginName": "kefu01", "phone": "13800138000", "password": "Password123",
                                 "permissions": ["ORDER_FULFILL"]}
                                """))
                    .andExpect(status().isCreated());

            verify(shopSubaccountService)
                    .create(
                            eq(shopId),
                            eq(userId),
                            eq("kefu01"),
                            eq("13800138000"),
                            eq("Password123"),
                            eq(List.of("ORDER_FULFILL")));
        }

        @Test
        void 登录名形状不合法_422() throws Exception {
            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"loginName": "客 服 01", "phone": "13800138000", "password": "Password123"}
                                """))
                    .andExpect(status().is(422));
        }

        @Test
        void 手机号非大陆号_422() throws Exception {
            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"loginName": "kefu01", "phone": "010-88886666", "password": "Password123"}
                                """))
                    .andExpect(status().is(422));
        }

        /** 非店主由 service 的店主闸门给 403，接口只负责把状态码带出去 */
        @Test
        void 非店主_403透传() throws Exception {
            doThrow(BusinessException.forbidden("只有店主可以执行该操作"))
                    .when(shopSubaccountService)
                    .create(eq(shopId), eq(userId), eq("kefu01"), eq("13800138000"), eq("Password123"), isNull());

            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"loginName": "kefu01", "phone": "13800138000", "password": "Password123"}
                                """))
                    .andExpect(status().isForbidden());
        }
    }

    @Nested
    class 子账号列表 { // GET /shops/{shopId}/subaccounts

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(get("/shops/{shopId}/subaccounts", shopId)).andExpect(status().isUnauthorized());
        }

        @Test
        void 绑定当前店主与路径店() throws Exception {
            when(shopSubaccountService.list(shopId, userId)).thenReturn(List.of());

            mockMvc.perform(get("/shops/{shopId}/subaccounts", shopId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(shopSubaccountService).list(shopId, userId);
        }
    }

    @Nested
    class 停用启用子账号 { // PATCH /shops/{shopId}/subaccounts/{id}/status

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(
                            patch("/shops/{shopId}/subaccounts/{id}/status", shopId, UUID.randomUUID())
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"enabled": false}
                                """))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 停用_透传enabled为false() throws Exception {
            UUID subaccountId = UUID.randomUUID();

            mockMvc.perform(
                            patch("/shops/{shopId}/subaccounts/{id}/status", shopId, subaccountId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"enabled": false}
                                """))
                    .andExpect(status().isOk());

            verify(shopSubaccountService).setEnabled(shopId, userId, subaccountId, false);
        }

        @Test
        void 缺enabled_422() throws Exception {
            mockMvc.perform(patch("/shops/{shopId}/subaccounts/{id}/status", shopId, UUID.randomUUID())
                            .with(userAuth(userId))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().is(422));
        }
    }

    @Nested
    class 重置子账号口令 { // POST /shops/{shopId}/subaccounts/{id}/password

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts/{id}/password", shopId, UUID.randomUUID())
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"password": "NewPassword456"}
                                """))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 绑定当前店主与路径变量() throws Exception {
            UUID subaccountId = UUID.randomUUID();

            mockMvc.perform(
                            post("/shops/{shopId}/subaccounts/{id}/password", shopId, subaccountId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"password": "NewPassword456"}
                                """))
                    .andExpect(status().isOk());

            verify(shopSubaccountService).resetPassword(shopId, userId, subaccountId, "NewPassword456");
        }
    }

    @Nested
    class 查看子账号号码明文 { // POST /shops/{shopId}/subaccounts/{id}/phone

        /** 列表里号码恒掩码，明文只从这一跳出，且带上操作人（service 侧打点留痕）；非本店 404 归 service 门 */
        @Test
        void 返回200_明文带操作人() throws Exception {
            UUID subaccountId = UUID.randomUUID();
            when(shopSubaccountService.revealPhone(shopId, userId, subaccountId))
                    .thenReturn("13900005678");

            mockMvc.perform(post("/shops/{shopId}/subaccounts/{id}/phone", shopId, subaccountId)
                            .with(userAuth(userId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.phone").value("13900005678"));

            verify(shopSubaccountService).revealPhone(shopId, userId, subaccountId);
        }

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/shops/{shopId}/subaccounts/{id}/phone", shopId, UUID.randomUUID()))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 移除子账号 { // DELETE /shops/{shopId}/subaccounts/{id}

        @Test
        void 仅店主_204() throws Exception {
            UUID subaccountId = UUID.randomUUID();

            mockMvc.perform(delete("/shops/{shopId}/subaccounts/{id}", shopId, subaccountId)
                            .with(userAuth(userId)))
                    .andExpect(status().isNoContent());

            verify(shopSubaccountService).remove(shopId, userId, subaccountId);
        }
    }

    /** 出参形状的最小构造：只填用例断言用得到的字段 */
    private static SubaccountItem subaccountItem(String status) {
        return new SubaccountItem(
                UUID.randomUUID(),
                "kefu01",
                "138****8000",
                com.shop.platform.account.api.SubaccountStatus.valueOf(status),
                List.of(),
                null,
                OffsetDateTime.now());
    }
}
