package com.shop.platform.shop;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.infra.security.JwtAuthFilter;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.StaffAuthFilter;
import com.shop.platform.infra.security.SubaccountAuthFilter;
import com.shop.platform.infra.web.RequestBodySizeFilter;
import com.shop.platform.infra.web.RequestIdFilter;
import com.shop.platform.shop.infra.ShopMembershipFilter;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * 卖家域判权链路集成验证（真库 + 真实过滤器/拦截器）：SubaccountAuthFilter 认领令牌 →
 * ShopMembershipFilter 按凭证装载店铺上下文 → SellerPermissionResolver 解析 → PermissionInterceptor 判权。
 *
 * <p>钉死六件事：零权限子账号全拒 / 按码授权放行对应域 / 店主仍走用户令牌且通配 / 收权与停用
 * 下一请求即生效 / 子账号的店自带（不吃 X-Shop-Id）/ 带了别家店的 X-Shop-Id 一律 403。
 */
@SpringBootTest
class SellerSubaccountPermissionIT extends IntegrationTestSupport {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtProvider jwtProvider;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private MockMvc mockMvc;

    private final UUID ownerId = UUID.randomUUID();

    private UUID shopId;

    private UUID subaccountId;

    @BeforeEach
    void setUpMvc() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(
                        context.getBean(RequestIdFilter.class),
                        context.getBean(RequestBodySizeFilter.class),
                        context.getBean(SubaccountAuthFilter.class),
                        context.getBean(StaffAuthFilter.class),
                        context.getBean(JwtAuthFilter.class),
                        context.getBean(ShopMembershipFilter.class))
                .build();
    }

    /** 直插 ACTIVE 店铺（店主 = ownerId）+ 店主成员行 + 一条指定状态/权限的子账号凭证 */
    private void seedShop(String subaccountStatus, String permissionsJson) {
        shopId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.shops (id, owner_id, name, status) VALUES (?::uuid, ?::uuid, ?, 'ACTIVE')",
                shopId.toString(),
                ownerId.toString(),
                "判权店铺" + shopId.toString().substring(0, 8));
        db.onDeleteShopSide(shopId);
        db.seedShopMember(shopId, ownerId, "OWNER", "ACTIVE");
        subaccountId = db.seedSubaccount(
                shopId,
                "sub" + shopId.toString().substring(0, 8),
                "13800" + Math.abs(shopId.hashCode() % 1_000_000),
                subaccountStatus,
                passwordEncoder.encode("Password123"),
                permissionsJson);
    }

    private String ownerToken() {
        return "Bearer " + jwtProvider.createAccessToken(ownerId);
    }

    private String subaccountToken() {
        return "Bearer " + jwtProvider.createSubaccountAccessToken(subaccountId);
    }

    @Test
    void 子账号_零权限_商品接口403带PERMISSION_DENIED() throws Exception {
        seedShop("ACTIVE", "[]");

        mockMvc.perform(get("/seller/products").header("Authorization", subaccountToken()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 子账号_仅商品权限_商品放行_订单拒() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");

        // 子账号的店自带在凭证上：请求刻意不带 X-Shop-Id
        mockMvc.perform(get("/seller/products").header("Authorization", subaccountToken()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/seller/orders").header("Authorization", subaccountToken()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 店主_仍走用户令牌_通配全放行() throws Exception {
        seedShop("ACTIVE", "[]");

        mockMvc.perform(get("/seller/products")
                        .header("Authorization", ownerToken())
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk());

        mockMvc.perform(get("/seller/orders")
                        .header("Authorization", ownerToken())
                        .header("X-Shop-Id", shopId.toString()))
                .andExpect(status().isOk());
    }

    @Test
    void 收权即时生效_改库后下一请求即403() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");
        String authz = subaccountToken();

        mockMvc.perform(get("/seller/products").header("Authorization", authz)).andExpect(status().isOk());

        // 直接改库模拟店主收权（不重发 token）：判权实时查库，下一请求立即被拒
        jdbc.update(
                "UPDATE account.shop_subaccounts SET permissions = '[]'::jsonb WHERE id = ?::uuid",
                subaccountId.toString());

        mockMvc.perform(get("/seller/products").header("Authorization", authz))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("PERMISSION_DENIED"));
    }

    @Test
    void 停用即时生效_改库后下一请求即403() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");
        String authz = subaccountToken();

        mockMvc.perform(get("/seller/products").header("Authorization", authz)).andExpect(status().isOk());

        // 停用即时生效靠的是「判权每请求查库」，不是令牌短命：旧令牌下一个请求就该被挡
        jdbc.update(
                "UPDATE account.shop_subaccounts SET status = 'DISABLED' WHERE id = ?::uuid", subaccountId.toString());

        mockMvc.perform(get("/seller/products").header("Authorization", authz))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("子账号不存在或已停用"));
    }

    @Test
    void 待激活子账号_过滤链挡在门外() throws Exception {
        seedShop("PENDING_ACTIVATION", "[\"PRODUCT_MANAGE\"]");

        mockMvc.perform(get("/seller/products").header("Authorization", subaccountToken()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("子账号不存在或已停用"));
    }

    @Test
    void 子账号带别家店的X_Shop_Id_403() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");

        mockMvc.perform(get("/seller/products")
                        .header("Authorization", subaccountToken())
                        .header("X-Shop-Id", UUID.randomUUID().toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("子账号只能操作所属店铺"));
    }

    @Test
    void 子账号令牌打买家侧接口_401() throws Exception {
        seedShop("ACTIVE", "[\"PRODUCT_MANAGE\"]");

        // 工作身份与私人身份不通用：子账号令牌在买家链路上是「类型错误」
        mockMvc.perform(get("/auth/me").header("Authorization", subaccountToken()))
                .andExpect(status().isUnauthorized());
    }
}
