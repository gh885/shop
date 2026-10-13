package com.shop.platform.shop;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.shop.platform.infra.security.JwtAuthFilter;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.StaffAuthFilter;
import com.shop.platform.infra.security.SubaccountAuthFilter;
import com.shop.platform.infra.web.RequestBodySizeFilter;
import com.shop.platform.infra.web.RequestIdFilter;
import com.shop.platform.shop.infra.ShopMembershipFilter;
import com.shop.platform.testsupport.IntegrationTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/**
 * 卖家子账号的端到端验收（真库 + 真过滤器链）：建号 → 未激活登不进 → 手机验证激活 → 用子账号凭证登进卖家工作台
 * → 子账号令牌登不进买家端 → 店主停用/启用 → 店主重置口令。
 *
 * <p>验收口径来自 docs/subaccount-rework-plan.md 阶段一，逐条对应下面每个用例。开发环境固定短信码
 * {@code 666666}、固定图形码 {@code DEV4}（见 ACC-35/36），所以激活链路在测试里走的是生产同一套代码路径。
 */
@SpringBootTest
class ShopSubaccountIT extends IntegrationTestSupport {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtProvider jwtProvider;

    /** 造请求体用：容器里没有裸 ObjectMapper bean（Boot 4 走 JsonMapper），本类只需要拼几段简单 JSON */
    private static final ObjectMapper objectMapper = JsonMapper.builder().build();

    @Autowired
    private StringRedisTemplate redis;

    private MockMvc mockMvc;

    private final UUID ownerId = UUID.randomUUID();

    private final UUID outsiderId = UUID.randomUUID();

    private UUID shopId;

    /** 每个用例自带登录名与手机号，避免撞 uk 索引；手机号落在 13x 段以满足大陆号强校验 */
    private final String phone =
            "138" + String.format("%08d", Math.abs(UUID.randomUUID().hashCode() % 100_000_000));

    private final String loginName = "sub" + UUID.randomUUID().toString().substring(0, 8);

    private static final String PASSWORD = "Password123";

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
        shopId = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO shop.shops (id, owner_id, name, status) VALUES (?::uuid, ?::uuid, ?, 'ACTIVE')",
                shopId.toString(),
                ownerId.toString(),
                "子账号店" + shopId.toString().substring(0, 8));
        db.onDeleteShopSide(shopId);
        db.seedShopMember(shopId, ownerId, "OWNER", "ACTIVE");
    }

    /** 发码走 IP 维度频控，而 MockMvc 的 remoteAddr 恒为 127.0.0.1：用例之间必须清掉，否则互相踩限额 */
    @AfterEach
    void cleanRateLimitKeys() {
        redis.delete(List.of("sms:ip:127.0.0.1", "sms:ip:phones:127.0.0.1", "sms:rate:" + phone, "sms:code:" + phone));
    }

    // ————————————————————— 用例 —————————————————————

    @Test
    void 建号_落待激活_手机号出参掩码() throws Exception {
        mockMvc.perform(post("/shops/{shopId}/subaccounts", shopId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "phone", phone, "password", PASSWORD))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.loginName").value(loginName))
                .andExpect(jsonPath("$.status").value("PENDING_ACTIVATION"))
                // 批量出参一律掩码（ACC-79）：号码明文只走逐条索取端点
                .andExpect(jsonPath("$.phone").value(com.shop.platform.common.PhoneNumber.mask(phone)));
    }

    @Test
    void 未激活就登录_403带SUBACCOUNT_NOT_ACTIVATED() throws Exception {
        createSubaccount(List.of("PRODUCT_MANAGE"));

        mockMvc.perform(post("/auth/subaccount/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "password", PASSWORD, "deviceId", "d1"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("SUBACCOUNT_NOT_ACTIVATED"));
    }

    @Test
    void 完整链路_激活后能登进卖家工作台_登不进买家端() throws Exception {
        String subaccountId = createSubaccount(List.of("PRODUCT_MANAGE"));

        // 1. 发激活码（匿名 + 图形码直通 DEV4）
        mockMvc.perform(post("/auth/subaccount/sms-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "loginName",
                                loginName,
                                "phone",
                                phone,
                                "captchaId",
                                UUID.randomUUID().toString(),
                                "captchaCode",
                                "DEV4"))))
                .andExpect(status().isOk());

        // 2. 激活即登录（开发环境固定短信码 666666）
        String accessToken = objectMapper
                .readTree(mockMvc.perform(post("/auth/subaccount/activate")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(Map.of(
                                        "loginName", loginName, "phone", phone, "code", "666666", "deviceId", "d1"))))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.accessToken").isString())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .path("accessToken")
                .asText();

        // 3. me：自带店铺 + 被授予的权限码
        mockMvc.perform(get("/auth/subaccount/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.shopId").value(shopId.toString()))
                .andExpect(jsonPath("$.loginName").value(loginName))
                .andExpect(jsonPath("$.permissions[0]").value("PRODUCT_MANAGE"));

        // 4. 卖家工作台放行（子账号的店自带，请求不带 X-Shop-Id）
        mockMvc.perform(get("/seller/products").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk());

        // 5. 子账号是纯工作身份：同一枚令牌登不进买家端
        mockMvc.perform(get("/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());

        // 6. 激活后可用口令登录
        mockMvc.perform(post("/auth/subaccount/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "password", PASSWORD, "deviceId", "d1"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isString());

        // 7. 店主停用 → 下一请求即失效
        mockMvc.perform(patch("/shops/{shopId}/subaccounts/{id}/status", shopId, subaccountId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("enabled", false))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/seller/products").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isForbidden());

        // 8. 店主启用 → 恢复（验过号的行回 ACTIVE）
        mockMvc.perform(patch("/shops/{shopId}/subaccounts/{id}/status", shopId, subaccountId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("enabled", true))))
                .andExpect(status().isOk());

        mockMvc.perform(get("/seller/products").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk());

        // 9. 店主重置口令 → 旧口令登录失败、新口令可用
        mockMvc.perform(post("/shops/{shopId}/subaccounts/{id}/password", shopId, subaccountId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("password", "NewPassword456"))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/auth/subaccount/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "password", PASSWORD, "deviceId", "d1"))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/auth/subaccount/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "password", "NewPassword456", "deviceId", "d1"))))
                .andExpect(status().isOk());
    }

    @Test
    void 非店主不能建号_403() throws Exception {
        mockMvc.perform(post("/shops/{shopId}/subaccounts", shopId)
                        .with(userAuth(outsiderId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "phone", phone, "password", PASSWORD))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("只有店主可以执行该操作"));
    }

    @Test
    void 同店同手机号只能一个子账号_400() throws Exception {
        createSubaccount(List.of());

        mockMvc.perform(post("/shops/{shopId}/subaccounts", shopId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName + "x", "phone", phone, "password", PASSWORD))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("该手机号在本店已有子账号"));
    }

    @Test
    void 登录名全局唯一_400() throws Exception {
        createSubaccount(List.of());
        String otherPhone =
                "139" + String.format("%08d", Math.abs(UUID.randomUUID().hashCode() % 100_000_000));

        mockMvc.perform(post("/shops/{shopId}/subaccounts", shopId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("loginName", loginName, "phone", otherPhone, "password", PASSWORD))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("登录名已被使用，请换一个"));
    }

    @Test
    void 子账号管理端点_子账号令牌进不来_401() throws Exception {
        String subaccountId = createSubaccount(List.of());
        String subToken = "Bearer " + jwtProvider.createSubaccountAccessToken(UUID.fromString(subaccountId));

        // /shops/** 只认用户令牌（店主）：子账号令牌在这里是「类型错误」
        mockMvc.perform(get("/shops/{shopId}/subaccounts", shopId).header(HttpHeaders.AUTHORIZATION, subToken))
                .andExpect(status().isUnauthorized());
    }

    // ————————————————————— 辅助 —————————————————————

    /** 店主身份 + JSON 头的请求后处理器（IT 基座不带接口测试那套 userAuth） */
    private org.springframework.test.web.servlet.request.RequestPostProcessor ownerAuth() {
        return bearer(jwtProvider.createAccessToken(ownerId));
    }

    /** 任意主体的用户令牌后处理器 */
    private org.springframework.test.web.servlet.request.RequestPostProcessor userAuth(UUID userId) {
        return bearer(jwtProvider.createAccessToken(userId));
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor bearer(String token) {
        return req -> {
            req.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token);
            req.setContentType(MediaType.APPLICATION_JSON_VALUE);
            return req;
        };
    }

    /** 建一个子账号，返回 id；建号入参只变权限码（登录名与手机号由用例固定） */
    private String createSubaccount(List<String> permissions) throws Exception {
        String body = objectMapper.writeValueAsString(
                Map.of("loginName", loginName, "phone", phone, "password", PASSWORD, "permissions", permissions));
        String response = mockMvc.perform(post("/shops/{shopId}/subaccounts", shopId)
                        .with(ownerAuth())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode node = objectMapper.readTree(response);
        return node.path("id").asText();
    }
}
