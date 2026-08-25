package com.shop.platform.shop;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.shop.mapper.Shop;
import com.shop.platform.shop.mapper.ShopMember;
import com.shop.platform.shop.service.ShopInviteItem;
import com.shop.platform.shop.service.ShopMemberItem;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 店铺管理接口契约：开店落待审核、邀请确认流、成员列表（跨 schema 拼装手机号）、店主移除成员。
 * 事件链路（开店 → 审核入队）见 EventPublicationIT。
 */
class ShopControllerTest extends WebControllerTestSupport {

    private final UUID userId = UUID.randomUUID();

    private final UUID shopId = UUID.randomUUID();

    @AfterEach
    void clearContext() {
        UserIdHolder.clear();
    }

    private Shop shop(String status) {
        Shop s = new Shop();
        s.setId(shopId);
        s.setOwnerId(userId);
        s.setName("测试店铺");
        s.setStatus(status);
        s.setCreatedAt(OffsetDateTime.now());
        s.setUpdatedAt(OffsetDateTime.now());
        return s;
    }

    @Test
    void 开店_落待审核状态() throws Exception {
        when(shopService.createShop(eq(userId), eq("新店铺"), isNull())).thenReturn(shop(Shop.STATUS_PENDING_REVIEW));

        mockMvc.perform(post("/shops")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"name": "新店铺"}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(Shop.STATUS_PENDING_REVIEW))
                .andExpect(jsonPath("$.name").value("测试店铺"));
    }

    @Test
    void 开店_空名_422() throws Exception {
        mockMvc.perform(post("/shops")
                        .header("Authorization", "Bearer " + userToken(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"name": ""}
                            """))
                .andExpect(status().is(422));
    }

    @Test
    void 我的店铺列表() throws Exception {
        when(shopService.myShops(userId)).thenReturn(List.of(shop(Shop.STATUS_ACTIVE)));

        mockMvc.perform(get("/shops/mine").header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value(Shop.STATUS_ACTIVE));
    }

    @Test
    void 我的待确认邀请() throws Exception {
        when(shopService.myInvites(userId))
                .thenReturn(List.of(new ShopInviteItem(UUID.randomUUID(), shopId, "测试店铺", OffsetDateTime.now())));

        mockMvc.perform(get("/shops/invites").header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].shopName").value("测试店铺"));
    }

    @Test
    void 接受邀请_成为ACTIVE成员() throws Exception {
        UUID memberId = UUID.randomUUID();
        ShopMember member = new ShopMember();
        member.setId(memberId);
        member.setShopId(shopId);
        member.setUserId(userId);
        member.setRole("OWNER");
        member.setStatus("ACTIVE");
        when(shopService.acceptInvite(memberId, userId)).thenReturn(member);

        mockMvc.perform(post("/shops/invites/{memberId}/accept", memberId)
                        .header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void 成员列表_拼装手机号() throws Exception {
        when(shopService.members(shopId, userId))
                .thenReturn(List.of(new ShopMemberItem(UUID.randomUUID(), userId, "138****0000", "OWNER", "ACTIVE")));

        mockMvc.perform(get("/shops/{shopId}/members", shopId).header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].phone").value("138****0000"));
    }

    @Test
    void 邀请成员_按手机号() throws Exception {
        ShopMember member = new ShopMember();
        member.setId(UUID.randomUUID());
        member.setShopId(shopId);
        member.setStatus("INVITED");
        when(shopService.invite(eq(shopId), eq(userId), eq("13800138000"))).thenReturn(member);

        mockMvc.perform(
                        post("/shops/{shopId}/invites", shopId)
                                .header("Authorization", "Bearer " + userToken(userId))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                            {"phone": "13800138000"}
                            """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INVITED"));
    }

    @Test
    void 移除成员_仅店主() throws Exception {
        UUID memberId = UUID.randomUUID();

        mockMvc.perform(delete("/shops/{shopId}/members/{memberId}", shopId, memberId)
                        .header("Authorization", "Bearer " + userToken(userId)))
                .andExpect(status().isOk());

        verify(shopService).removeMember(shopId, memberId, userId);
    }

    @Test
    void 未登录_401() throws Exception {
        mockMvc.perform(get("/shops/mine")).andExpect(status().isUnauthorized());
    }
}
