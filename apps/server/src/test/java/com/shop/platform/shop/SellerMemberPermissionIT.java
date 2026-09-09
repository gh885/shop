package com.shop.platform.shop;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.JwtAuthFilter;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.StaffAuthFilter;
import com.shop.platform.infra.web.RequestBodySizeFilter;
import com.shop.platform.infra.web.RequestIdFilter;
import com.shop.platform.shop.infra.ShopMembershipFilter;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * 卖家域判权链路集成验证（真库 + 真实过滤器/拦截器）：
 * ShopMembershipFilter 装载成员上下文 → SellerPermissionResolver 解析 → PermissionInterceptor 判权。
 * 钉死四件事：零权限子账号全拒 / 按 code 授权放行对应域 / OWNER 通配 / 收权下一请求即生效（TIME-01）。
 */
@SpringBootTest
class SellerMemberPermissionIT extends IntegrationTestSupport {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtProvider jwtProvider;

    @Autowired
    private com.shop.platform.shop.service.ShopService shopService;

    private MockMvc mockMvc;

    private final UUID ownerId = UUID.randomUUID();

    private final UUID memberId = UUID.randomUUID();

    private UUID shopId;

    @BeforeEach
    void setUpMvc() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(
                        context.getBean(RequestIdFilter.class),
                        context.getBean(RequestBodySizeFilter.class),
                        context.getBean(StaffAuthFilter.class),
                        context.getBean(JwtAuthFilter.class),
                        context.getBean(ShopMembershipFilter.class))
                .build();
    }

    /** 直插 ACTIVE 店铺 + 店主 + 指定状态的子账号（permissions 为 jsonb 字面量），登记逆序清理 */
    private void seedShop(String memberStatus, String permissionsJson) {
        shopId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.shops (id, owner_id, name, status) VALUES (?::uuid, ?::uuid, ?, 'ACTIVE')",
                shopId.toString(),
                ownerId.toString(),
                "判权店铺" + shopId.toString().substring(0, 8));
        jdbc.update(
                "INSERT INTO shop.shop_members (id, shop_id, user_id, role, status) VALUES (?::uuid, ?::uuid, ?::uuid, 'OWNER', 'ACTIVE')",
                UUID.randomUUID().toString(),
                shopId.toString(),
                ownerId.toString());
        jdbc.update(
                "INSERT INTO shop.shop_members (id, shop_id, user_id, role, status, permissions) VALUES (?::uuid, ?::uuid, ?::uuid, 'MEMBER', ?, ?::jsonb)",
                UUID.randomUUID().toString(),
                shopId.toString(),
                memberId.toString(),
                memberStatus,
                permissionsJson);
        db.onDelete("DELETE FROM shop.shop_members WHERE shop_id = ?", shopId);
        db.onDelete("DELETE FROM shop.shops WHERE id = ?", shopId);
    }

    private String token(UUID userId) {
        return "Bearer " + jwtProvider.createAccessToken(userId);
    }

    @Test
    void 子账号_零权限_商品接口403带PERMISSION_DENIED() throws Exception {
        seedShop("ACTIVE", "[]");

        mockMvc.perform(get("/seller/products")
                        .header("Authorization", token(memberId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 子账号_仅商品权限_商品放行_订单拒() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");

        mockMvc.perform(get("/seller/products")
                        .header("Authorization", token(memberId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/seller/orders")
                        .header("Authorization", token(memberId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 店主_通配_全放行() throws Exception {
        seedShop("ACTIVE", "[]");

        mockMvc.perform(get("/seller/products")
                        .header("Authorization", token(ownerId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/seller/orders")
                        .header("Authorization", token(ownerId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk());
    }

    @Test
    void 收权即时生效_改库后下一请求即403() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");
        String authz = token(memberId);
        String shopHeader = shopId.toString();

        mockMvc.perform(get("/seller/products").header("Authorization", authz).header("X-Shop-Id", shopHeader))
                .andExpect(status().isOk());

        // 直接改库模拟店主收权（不重发 token）：判权实时查库，下一请求立即被拒
        jdbc.update(
                "UPDATE shop.shop_members SET permissions = ?::jsonb WHERE user_id = ?::uuid AND role = 'MEMBER'",
                "[]",
                memberId.toString());

        mockMvc.perform(get("/seller/products").header("Authorization", authz).header("X-Shop-Id", shopHeader))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void PENDING子账号_过滤链仍挡在门外() throws Exception {
        seedShop("PENDING", "[]");

        mockMvc.perform(get("/seller/products")
                        .header("Authorization", token(memberId))
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("你不是该店铺成员"));
    }

    @Test
    void 改权接口_白名单外码拒绝_合法码生效() {
        seedShop("ACTIVE", "[]");
        UUID memberRowId = jdbc.queryForObject(
                "SELECT id FROM shop.shop_members WHERE shop_id = ?::uuid AND role = 'MEMBER'",
                UUID.class,
                shopId.toString());

        // 白名单外码（STAFF_MANAGE 属平台域，不可授予子账号）
        try {
            shopService.updatePermissions(shopId, memberRowId, ownerId, java.util.List.of("STAFF_MANAGE"));
            throw new AssertionError("白名单外码应被拒绝");
        } catch (BusinessException expected) {
            // 400 即预期
        }

        shopService.updatePermissions(shopId, memberRowId, ownerId, java.util.List.of("ORDER_FULFILL"));
        var perms = jdbc.queryForObject(
                "SELECT permissions FROM shop.shop_members WHERE id = ?::uuid", String.class, memberRowId.toString());
        org.junit.jupiter.api.Assertions.assertTrue(perms.contains("ORDER_FULFILL"));
    }
}
