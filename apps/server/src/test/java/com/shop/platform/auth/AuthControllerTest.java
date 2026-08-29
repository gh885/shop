package com.shop.platform.auth;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.testsupport.WebControllerTestSupport;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;

/**
 * 认证接口契约：参数校验、JwtAuthFilter 守卫、refresh 双来源（Cookie/Body）、Cookie 属性、
 * RequestBodySizeFilter、ClientIp 提取。service 全 mock（基类），业务规则见 AuthServiceTest。
 */
class AuthControllerTest extends WebControllerTestSupport {

    private static final UUID USER_ID = UUID.randomUUID();

    /** 发码请求体模板：phone 可变（空/过短/合法），复用同一骨架 */
    private static String smsBody(String phone) {
        return """
            {"phone": "%s", "captchaId": "c1", "captchaCode": "A1B2"}
            """
                .formatted(phone);
    }

    // 人机验证为发码前置防线：契约测试默认放行，后续单测单独覆盖 verify 逻辑（见 infra.captcha.CaptchaServiceTest）
    @BeforeEach
    void stubCaptcha() {
        doNothing().when(captchaService).verify(any(), any());
    }

    // ========== 请求体校验 (BODY-01) ==========

    @ParameterizedTest(name = "发送验证码_非法手机号[{0}]_422字段级拦截")
    @ValueSource(strings = {"", "123"})
    void 发送验证码_非法手机号_422字段级拦截(String phone) throws Exception {
        // 空手机号 / 过短手机号：同一 @NotBlank+@Size 校验，抽参数化合并
        mockMvc.perform(post("/auth/sms-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(smsBody(phone)))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("phone"));
    }

    @Test
    void 发送验证码_未知字段_400() throws Exception {
        // ERR-03: Jackson FAIL_ON_UNKNOWN_PROPERTIES → JSON 解析失败 → 400
        mockMvc.perform(
                        post("/auth/sms-code")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000", "extra": "field"}
                                    """))
                .andExpect(status().isBadRequest())
                .andExpect(status().isBadRequest());
    }

    @Test
    void 密码登录_全空字段_422() throws Exception {
        mockMvc.perform(
                        post("/auth/login/password")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "", "password": "", "deviceId": ""}
                                    """))
                .andExpect(status().is(422))
                // 每个字段触发 @NotBlank + @Size → phone(2) + password(2) + deviceId(1) = 5
                .andExpect(jsonPath("$.errors.length()").value(5));
    }

    // ========== JwtAuthFilter 校验 ==========
    // 注意：JwtAuthFilter 直接写响应（不走 @ControllerAdvice）

    @Test
    void 设置密码_无令牌_401() throws Exception {
        mockMvc.perform(
                        post("/auth/password")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"newPassword": "newPass123"}
                                    """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.detail").value("请先登录"));
    }

    @Test
    void 登出_无令牌_401() throws Exception {
        mockMvc.perform(
                        post("/auth/logout")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"deviceId": "dev1"}
                                    """))
                .andExpect(status().isUnauthorized());
        // 注：code=null 时响应 body 不含 code 字段
    }

    @Test
    void 设置密码_坏令牌_401() throws Exception {
        mockMvc.perform(
                        post("/auth/password")
                                .header("Authorization", "Bearer invalid.jwt.token")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"newPassword": "newPass123"}
                                    """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 设置密码_有效令牌_透传服务() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);

        mockMvc.perform(
                        post("/auth/password")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"currentPassword": "oldPass", "newPassword": "newPass123"}
                                    """))
                .andExpect(status().isOk());

        verify(authService).setPassword(eq(USER_ID), eq("oldPass"), eq("newPass123"));
    }

    // ========== Cookie 行为 ==========

    @Test
    void 密码登录_成功_下发刷新Cookie() throws Exception {
        when(authService.loginByPassword(anyString(), anyString(), anyString(), anyString(), nullable(String.class)))
                .thenReturn(new TokenPair("access-token", "rt:test-value"));

        mockMvc.perform(
                        post("/auth/login/password")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000", "password": "correctPass123", "deviceId": "dev1"}
                                    """))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("refresh_token"))
                .andExpect(cookie().httpOnly("refresh_token", true))
                .andExpect(cookie().secure("refresh_token", true))
                .andExpect(cookie().path("refresh_token", "/auth/refresh"))
                .andExpect(cookie().maxAge("refresh_token", 7 * 24 * 60 * 60));
    }

    @Test
    void 刷新_Cookie携带_成功() throws Exception {
        when(authService.refresh(eq("rt:cookie"), nullable(String.class), anyString(), nullable(String.class)))
                .thenReturn(new TokenPair("new-at", "rt:new"));

        mockMvc.perform(post("/auth/refresh")
                        .cookie(new Cookie("refresh_token", "rt:cookie"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                    {}
                                    """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-at"))
                // refresh token 只走 httpOnly cookie，@JsonIgnore 不落响应体（防 XSS 读走凭证）
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andExpect(cookie().exists("refresh_token"));
    }

    @Test
    void 刷新_请求体兜底() throws Exception {
        when(authService.refresh(eq("rt:body"), nullable(String.class), anyString(), nullable(String.class)))
                .thenReturn(new TokenPair("new-at", "rt:new"));

        mockMvc.perform(
                        post("/auth/refresh")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"refreshToken": "rt:body", "deviceId": "dev1"}
                                    """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-at"))
                .andExpect(cookie().exists("refresh_token"));
    }

    @Test
    void 刷新_无令牌_401() throws Exception {
        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                    {}
                                    """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void 登出_清除Cookie() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);

        mockMvc.perform(
                        post("/auth/logout")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"deviceId": "dev1"}
                                    """))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("refresh_token"))
                .andExpect(cookie().maxAge("refresh_token", 0));
    }

    // ========== 成功路径 ==========

    @Test
    void 发送验证码_成功() throws Exception {
        mockMvc.perform(post("/auth/sms-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(smsBody("13800138000")))
                .andExpect(status().isOk());

        verify(smsCodeService).sendCode(eq("13800138000"), anyString());
        verify(captchaService).verify(eq("c1"), eq("A1B2"));
    }

    @Test
    void 密码登录_成功_刷新令牌只进Cookie() throws Exception {
        when(authService.loginByPassword(anyString(), anyString(), anyString(), anyString(), nullable(String.class)))
                .thenReturn(new TokenPair("at1", "rt1"));

        mockMvc.perform(
                        post("/auth/login/password")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000", "password": "password123", "deviceId": "dev1"}
                                    """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("at1"))
                // refresh token 不落响应体，只走 httpOnly cookie（见 TokenPair 的 @JsonIgnore）
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andExpect(cookie().exists("refresh_token"));
    }

    // ========== RequestBodySizeFilter (SEC-04) ==========

    @Test
    void 请求体超限_413() throws Exception {
        // 超过 1MB 限制 → 413，filter 在 JSON 解析前拦截
        String largeBody = "x".repeat(1_048_577);

        mockMvc.perform(post("/auth/sms-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(largeBody))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("request.too_large"));
    }

    // ========== IP 提取 ==========

    @Test
    void 验证码_IP来源_XFF默认不信任() throws Exception {
        // ClientIp 默认不信 XFF（客户端自报头，盲信会让 IP 限流失效）→ 用 TCP 对端地址
        mockMvc.perform(post("/auth/sms-code")
                        .header("X-Forwarded-For", "203.0.113.1, 10.0.0.1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(smsBody("13800138000")))
                .andExpect(status().isOk());

        verify(smsCodeService).sendCode(eq("13800138000"), eq("127.0.0.1"));
    }

    @Test
    void 验证码_IP来源_取对端地址() throws Exception {
        mockMvc.perform(post("/auth/sms-code")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(smsBody("13800138000")))
                .andExpect(status().isOk());

        // MockMvc 默认 RemoteAddr 为 127.0.0.1
        verify(smsCodeService).sendCode(eq("13800138000"), eq("127.0.0.1"));
    }

    // ========== 个人资料 / 设备管理 ==========

    @Test
    void 更新个人资料_成功() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);
        when(authService.updateProfile(eq(USER_ID), any())).thenReturn(meUser());

        mockMvc.perform(
                        put("/auth/profile")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"nickname": "阿店"}
                                    """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("阿店"));
    }

    @Test
    void 更新个人资料_空昵称_422() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);
        mockMvc.perform(
                        put("/auth/profile")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"nickname": ""}
                                    """))
                .andExpect(status().is(422));
    }

    @Test
    void 设备列表_成功_标记当前设备() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);
        when(authService.listDevices(eq(USER_ID), eq("dev-current")))
                .thenReturn(java.util.List.of(
                        new RefreshTokenStore.DeviceEntry(
                                "dev-current",
                                new DeviceInfo("Windows Chrome", "127.0.0.1", java.time.OffsetDateTime.now())),
                        new RefreshTokenStore.DeviceEntry(
                                "dev-old",
                                new DeviceInfo("iPhone Safari", "203.0.113.1", java.time.OffsetDateTime.now()))));

        mockMvc.perform(get("/auth/devices")
                        .header("Authorization", "Bearer " + token)
                        .param("currentDeviceId", "dev-current"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].deviceId").value("dev-current"))
                .andExpect(jsonPath("$[0].isCurrent").value(true))
                .andExpect(jsonPath("$[1].isCurrent").value(false));
    }

    @Test
    void 登出单个设备_成功() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);
        mockMvc.perform(delete("/auth/devices/dev-old").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        verify(authService).deleteDevice(eq(USER_ID), eq("dev-old"));
    }

    @Test
    void 登出所有设备_成功() throws Exception {
        String token = jwtProvider.createAccessToken(USER_ID);
        mockMvc.perform(post("/auth/logout-all").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
        verify(authService).logoutAll(eq(USER_ID));
    }

    @Test
    void 设备接口_无令牌_401() throws Exception {
        mockMvc.perform(get("/auth/devices")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/auth/profile").header("Authorization", "x")).andExpect(status().isUnauthorized());
    }

    /** mock MeResponse 用的便捷构造（nickname 可被 updateProfile 返回） */
    private com.shop.platform.auth.mapper.User meUser() {
        com.shop.platform.auth.mapper.User u = new com.shop.platform.auth.mapper.User();
        u.setId(USER_ID);
        u.setPhone("13800138000");
        u.setNickname("阿店");
        return u;
    }
}
