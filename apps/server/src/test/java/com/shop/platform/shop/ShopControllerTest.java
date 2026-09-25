package com.shop.platform.shop;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.model.MemberRole;
import com.shop.platform.shop.model.MemberStatus;
import com.shop.platform.shop.model.ShopStatus;
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
    class 邀请 { // POST /shops/{shopId}/invites

        @Test
        void 按手机号() throws Exception {
            ShopMember member = new ShopMember();
            member.setId(UUID.randomUUID());
            member.setShopId(shopId);
            member.setStatus(MemberStatus.PENDING);
            when(shopService.invite(eq(shopId), eq(userId), eq("13800138000"), eq(null)))
                    .thenReturn(member);

            mockMvc.perform(
                            post("/shops/{shopId}/invites", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000"}
                                """))
                    .andExpect(status().isOk());

            verify(shopService).invite(eq(shopId), eq(userId), eq("13800138000"), eq(null));
        }

        @Test
        void 携带权限码() throws Exception {
            ShopMember member = new ShopMember();
            member.setId(UUID.randomUUID());
            member.setShopId(shopId);
            member.setStatus(MemberStatus.PENDING);
            when(shopService.invite(eq(shopId), eq(userId), eq("13800138000"), eq(List.of("ORDER_FULFILL"))))
                    .thenReturn(member);

            mockMvc.perform(
                            post("/shops/{shopId}/invites", shopId)
                                    .with(userAuth(userId))
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "permissions": ["ORDER_FULFILL"]}
                                """))
                    .andExpect(status().isOk());

            verify(shopService).invite(eq(shopId), eq(userId), eq("13800138000"), eq(List.of("ORDER_FULFILL")));
        }
    }

    @Nested
    class 接受邀请 { // POST /shops/invites/{memberId}/accept

        @Test
        void 成为ACTIVE成员() throws Exception {
            UUID memberId = UUID.randomUUID();
            ShopMember member = new ShopMember();
            member.setId(memberId);
            member.setShopId(shopId);
            member.setUserId(userId);
            member.setRole(MemberRole.OWNER);
            member.setStatus(MemberStatus.ACTIVE);
            when(shopService.acceptInvite(memberId, userId)).thenReturn(member);

            mockMvc.perform(post("/shops/invites/{memberId}/accept", memberId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(shopService).acceptInvite(memberId, userId);
        }
    }

    @Nested
    class 拒绝邀请 { // POST /shops/invites/{memberId}/decline

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/shops/invites/{memberId}/decline", UUID.randomUUID()))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 空响应_绑定当前用户与路径变量() throws Exception {
            UUID memberId = UUID.randomUUID();

            mockMvc.perform(post("/shops/invites/{memberId}/decline", memberId).with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(shopService).declineInvite(memberId, userId);
        }

        @Test
        void 已同意后拒绝_409透传() throws Exception {
            UUID memberId = UUID.randomUUID();
            doThrow(BusinessException.conflict(null, "该邀请已处理"))
                    .when(shopService)
                    .declineInvite(memberId, userId);

            mockMvc.perform(post("/shops/invites/{memberId}/decline", memberId).with(userAuth(userId)))
                    .andExpect(status().isConflict());
        }
    }

    @Nested
    class 查看成员号码明文 { // POST /shops/{shopId}/members/{memberId}/phone

        /** 列表里别人的号是掩码，明文只从这一跳出，且带上操作人（service 侧打点留痕）；非本店成员 403 归 service 门 */
        @Test
        void 返回200_明文带操作人() throws Exception {
            UUID memberId = UUID.randomUUID();
            when(shopService.memberPhone(shopId, memberId, userId)).thenReturn("13900005678");

            mockMvc.perform(post("/shops/{shopId}/members/{memberId}/phone", shopId, memberId)
                            .with(userAuth(userId)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.phone").value("13900005678"));

            verify(shopService).memberPhone(shopId, memberId, userId);
        }

        @Test
        void 未登录_401() throws Exception {
            mockMvc.perform(post("/shops/{shopId}/members/{memberId}/phone", shopId, UUID.randomUUID()))
                    .andExpect(status().isUnauthorized());
        }
    }

    @Nested
    class 移除成员 { // DELETE /shops/{shopId}/members/{memberId}

        @Test
        void 仅店主() throws Exception {
            UUID memberId = UUID.randomUUID();

            mockMvc.perform(delete("/shops/{shopId}/members/{memberId}", shopId, memberId)
                            .with(userAuth(userId)))
                    .andExpect(status().isNoContent());

            verify(shopService).removeMember(shopId, memberId, userId);
        }
    }
}
