package com.shop.platform.shop;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
                    .andExpect(status().isOk());

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
    class 移除成员 { // DELETE /shops/{shopId}/members/{memberId}

        @Test
        void 仅店主() throws Exception {
            UUID memberId = UUID.randomUUID();

            mockMvc.perform(delete("/shops/{shopId}/members/{memberId}", shopId, memberId)
                            .with(userAuth(userId)))
                    .andExpect(status().isOk());

            verify(shopService).removeMember(shopId, memberId, userId);
        }
    }
}
