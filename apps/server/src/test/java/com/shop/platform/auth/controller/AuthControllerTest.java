package com.shop.platform.auth.controller;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.shop.platform.auth.infra.JwtAuthFilter;
import com.shop.platform.auth.infra.JwtProvider;
import com.shop.platform.auth.service.AuthService;
import com.shop.platform.auth.service.AuthService.TokenResult;
import com.shop.platform.auth.service.SmsCodeService;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.RequestBodySizeFilter;
import com.shop.platform.infra.RequestIdFilter;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@TestPropertySource(
        properties = {
            "spring.flyway.enabled=false",
            "spring.autoconfigure.exclude="
                    + "org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,"
                    + "org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration,"
                    + "org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration,"
                    + "org.springframework.boot.autoconfigure.data.redis.RedisRepositoriesAutoConfiguration"
        })
class AuthControllerTest {

    private MockMvc mockMvc;

    @Autowired WebApplicationContext context;

    @MockitoBean AuthService authService;

    @MockitoBean SmsCodeService smsCodeService;

    @Autowired JwtProvider jwtProvider;

    @BeforeEach
    void setUp() {
        UserIdHolder.clear();
        // webAppContextSetup 不会自动注册 Filter Bean，手动把所有 Filter 加进去
        mockMvc =
                MockMvcBuilders.webAppContextSetup(context)
                        .addFilters(
                                context.getBean(RequestIdFilter.class),
                                context.getBean(RequestBodySizeFilter.class),
                                context.getBean(JwtAuthFilter.class))
                        .build();
    }

    // ========== 请求体校验 (BODY-01) ==========

    @Test
    void sendSmsCode_blankPhone_returns422() throws Exception {
        mockMvc.perform(
                        post("/auth/sms-code")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": ""}
                                    """))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("phone"));
    }

    @Test
    void sendSmsCode_tooShortPhone_returns422() throws Exception {
        mockMvc.perform(
                        post("/auth/sms-code")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "123"}
                                    """))
                .andExpect(status().is(422))
                .andExpect(jsonPath("$.errors[0].field").value("phone"));
    }

    @Test
    void sendSmsCode_unknownField_returns400() throws Exception {
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
    void loginByPassword_blankFields_returns422() throws Exception {
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
    void setPassword_withoutToken_returns401() throws Exception {
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
    void logout_withoutToken_returns401() throws Exception {
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
    void setPassword_withInvalidToken_returns401() throws Exception {
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
    void setPassword_withValidToken_callsService() throws Exception {
        String token = jwtProvider.createAccessToken(42L);

        mockMvc.perform(
                        post("/auth/password")
                                .header("Authorization", "Bearer " + token)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"currentPassword": "oldPass", "newPassword": "newPass123"}
                                    """))
                .andExpect(status().isOk());

        verify(authService).setPassword(eq(42L), eq("oldPass"), eq("newPass123"));
    }

    // ========== Cookie 行为 ==========

    @Test
    void loginByPassword_success_setsRefreshCookie() throws Exception {
        when(authService.loginByPassword(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(new TokenResult("access-token", "rt:test-value"));

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
    void refresh_fromCookie_succeeds() throws Exception {
        when(authService.refresh(eq("rt:cookie"), anyString()))
                .thenReturn(new TokenResult("new-at", "rt:new"));

        mockMvc.perform(
                        post("/auth/refresh")
                                .cookie(new Cookie("refresh_token", "rt:cookie"))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {}
                                    """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-at"))
                .andExpect(jsonPath("$.refreshToken").value("rt:new"))
                .andExpect(cookie().exists("refresh_token"));
    }

    @Test
    void refresh_fromBody_fallsBack() throws Exception {
        when(authService.refresh(eq("rt:body"), anyString()))
                .thenReturn(new TokenResult("new-at", "rt:new"));

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
    void refresh_noToken_returns401() throws Exception {
        mockMvc.perform(
                        post("/auth/refresh")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {}
                                    """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
    }

    @Test
    void logout_clearsCookie() throws Exception {
        String token = jwtProvider.createAccessToken(7L);

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
    void sendSmsCode_success_returns200() throws Exception {
        mockMvc.perform(
                        post("/auth/sms-code")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000"}
                                    """))
                .andExpect(status().isOk());

        verify(smsCodeService).sendCode(eq("13800138000"), anyString());
    }

    @Test
    void loginByPassword_success_returnsTokenResult() throws Exception {
        when(authService.loginByPassword(anyString(), anyString(), anyString(), anyString()))
                .thenReturn(new TokenResult("at1", "rt1"));

        mockMvc.perform(
                        post("/auth/login/password")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000", "password": "password123", "deviceId": "dev1"}
                                    """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("at1"))
                .andExpect(jsonPath("$.refreshToken").value("rt1"))
                .andExpect(cookie().exists("refresh_token"));
    }

    // ========== RequestBodySizeFilter (SEC-04) ==========

    @Test
    void requestBodyTooLarge_returns413() throws Exception {
        // 超过 1MB 限制 → 413，filter 在 JSON 解析前拦截
        String largeBody = "x".repeat(1_048_577);

        mockMvc.perform(
                        post("/auth/sms-code")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(largeBody))
                .andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("request.too_large"));
    }

    // ========== IP 提取 ==========

    @Test
    void sendSmsCode_withXForwardedFor_passesClientIp() throws Exception {
        mockMvc.perform(
                        post("/auth/sms-code")
                                .header("X-Forwarded-For", "203.0.113.1, 10.0.0.1")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000"}
                                    """))
                .andExpect(status().isOk());

        verify(smsCodeService).sendCode(eq("13800138000"), eq("203.0.113.1"));
    }

    @Test
    void sendSmsCode_withoutXForwardedFor_usesRemoteAddr() throws Exception {
        mockMvc.perform(
                        post("/auth/sms-code")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(
                                        """
                                    {"phone": "13800138000"}
                                    """))
                .andExpect(status().isOk());

        // MockMvc 默认 RemoteAddr 为 127.0.0.1
        verify(smsCodeService).sendCode(eq("13800138000"), eq("127.0.0.1"));
    }
}
