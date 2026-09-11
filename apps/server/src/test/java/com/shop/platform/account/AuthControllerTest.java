package com.shop.platform.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.testsupport.WebControllerTestSupport;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;

/**
 * 认证接口契约。分组 = 接口路径（{@code @Nested} 一层一条路由），方法 = HTTP 语义场景。
 *
 * <p>HTTP 独有：status、JwtAuthFilter 守卫（401）、请求入参校验（422）/未知字段（400）/体积（413）、
 * Cookie 属性（httpOnly/secure/path/maxAge 清空）、refresh token 不进响应体的 absence、ClientIp 来源、路由与参数绑定（verify）。
 * 令牌签发/校验逻辑归 infra.security，业务规则归 AuthServiceTest。
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

    // 人机验证为发码前置防线：契约测试默认放行，verify 逻辑归 account.infra.CaptchaServiceTest
    @BeforeEach
    void stubCaptcha() {
        doNothing().when(captchaService).verify(any(), any());
    }

    @Nested
    class 发送验证码 { // POST /auth/sms-code

        @ParameterizedTest(name = "非法手机号[{0}]_422字段级拦截")
        @ValueSource(strings = {"", "123"})
        void 非法手机号_422字段级拦截(String phone) throws Exception {
            mockMvc.perform(post("/auth/sms-code")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(smsBody(phone)))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("phone"));
        }

        @Test
        void 未知字段_400() throws Exception {
            // ERR-03: Jackson FAIL_ON_UNKNOWN_PROPERTIES → JSON 解析失败 → 400
            mockMvc.perform(
                            post("/auth/sms-code")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "extra": "field"}
                                """))
                    .andExpect(status().isBadRequest());
        }

        @Test
        void 成功_人机校验后发码() throws Exception {
            mockMvc.perform(post("/auth/sms-code")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(smsBody("13800138000")))
                    .andExpect(status().isOk());

            verify(smsCodeService).sendCode(eq("13800138000"), anyString());
            verify(captchaService).verify(eq("c1"), eq("A1B2"));
        }

        @Test
        void IP来源_XFF默认不信任_取对端地址() throws Exception {
            // ClientIp 默认不信 XFF（客户端自报头，盲信会让 IP 限流失效）→ 用 TCP 对端地址
            mockMvc.perform(post("/auth/sms-code")
                            .header("X-Forwarded-For", "203.0.113.1, 10.0.0.1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(smsBody("13800138000")))
                    .andExpect(status().isOk());

            verify(smsCodeService).sendCode(eq("13800138000"), eq("127.0.0.1"));
        }

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
    }

    @Nested
    class 密码登录 { // POST /auth/login/password

        @Test
        void 全空字段_422() throws Exception {
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

        @Test
        void 成功_刷新令牌只进HttpOnly_Cookie_不进响应体() throws Exception {
            when(authService.loginByPassword(
                            anyString(), anyString(), anyString(), anyString(), nullable(String.class)))
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
                    .andExpect(cookie().maxAge("refresh_token", 7 * 24 * 60 * 60))
                    // 只有 httpOnly cookie 这条路：进响应体就会被 XSS 读走
                    .andExpect(jsonPath("$.refreshToken").doesNotExist());
        }
    }

    @Nested
    class 刷新 { // POST /auth/refresh

        @Test
        void Cookie携带_成功() throws Exception {
            when(authService.refresh(eq("rt:cookie"), nullable(String.class), anyString(), nullable(String.class)))
                    .thenReturn(new TokenPair("new-at", "rt:new"));

            mockMvc.perform(post("/auth/refresh")
                            .cookie(new Cookie("refresh_token", "rt:cookie"))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                {}
                                """))
                    .andExpect(status().isOk())
                    // refresh token 只走 httpOnly cookie，@JsonIgnore 不落响应体（防 XSS 读走凭证）
                    .andExpect(jsonPath("$.refreshToken").doesNotExist())
                    .andExpect(cookie().exists("refresh_token"));
        }

        @Test
        void 请求体兜底() throws Exception {
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
                    .andExpect(cookie().exists("refresh_token"));
        }

        @Test
        void 无令牌_401() throws Exception {
            mockMvc.perform(post("/auth/refresh")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                {}
                                """))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_TOKEN"));
        }
    }

    @Nested
    class 设置密码 { // POST /auth/password

        @Test
        void 无令牌_401提示登录() throws Exception {
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
        void 坏令牌_401() throws Exception {
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
        void 有效令牌_透传服务() throws Exception {
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
    }

    @Nested
    class 登出 { // POST /auth/logout

        @Test
        void 无令牌_401() throws Exception {
            mockMvc.perform(
                            post("/auth/logout")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"deviceId": "dev1"}
                                """))
                    .andExpect(status().isUnauthorized());
        }

        @Test
        void 清除Cookie() throws Exception {
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
    }

    @Nested
    class 更新资料 { // PUT /auth/profile

        @Test
        void 空昵称_422() throws Exception {
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
    }

    @Nested
    class 设备 { // /auth/devices

        @Test
        void 无令牌_401() throws Exception {
            mockMvc.perform(get("/auth/devices")).andExpect(status().isUnauthorized());
            mockMvc.perform(get("/auth/profile").header("Authorization", "x")).andExpect(status().isUnauthorized());
        }

        @Test
        void 登出单个设备_透传() throws Exception {
            String token = jwtProvider.createAccessToken(USER_ID);
            mockMvc.perform(delete("/auth/devices/dev-old").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
            verify(authService).deleteDevice(eq(USER_ID), eq("dev-old"));
        }

        @Test
        void 登出所有设备_透传() throws Exception {
            String token = jwtProvider.createAccessToken(USER_ID);
            mockMvc.perform(post("/auth/logout-all").header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
            verify(authService).logoutAll(eq(USER_ID));
        }
    }
}
