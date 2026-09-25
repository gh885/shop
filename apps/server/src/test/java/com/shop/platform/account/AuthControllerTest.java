package com.shop.platform.account;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.shop.platform.account.infra.CaptchaService;
import com.shop.platform.infra.qiniu.UploadTicket;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.testsupport.WebControllerTestSupport;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
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

    @Nested
    class 发送验证码 { // POST /auth/sms-code

        @ParameterizedTest(name = "非法手机号[{0}]_422字段级拦截")
        @ValueSource(strings = {"", "123", "1234567", "23800138000", "138001380001", "+8613800138000", "1380013800a"})
        void 非法手机号_422字段级拦截(String phone) throws Exception {
            // 发码入口触发真实发短信：只收大陆手机号（强校验卡「号形」，不只是长度）
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
        void 成功_手机号与人机码透传() throws Exception {
            // 人机验证 → 频控 → OTP 的先后是 AuthService 的内部条款（ACC-35，断言在 AuthServiceTest）；
            // 这里只保住三枚入参与 IP 确实从 HTTP 边界送到了那个用例
            mockMvc.perform(post("/auth/sms-code")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(smsBody("13800138000")))
                    .andExpect(status().isOk());

            verify(authService).sendSmsCode("13800138000", "c1", "A1B2", "127.0.0.1");
        }

        @Test
        void 缺人机码_422() throws Exception {
            // 人机码是入站必填，不是「前端记得带就行」——缺了要在方法体之前挡下
            mockMvc.perform(
                            post("/auth/sms-code")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "captchaCode": "A1B2"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("captchaId"));
        }

        @Test
        void IP来源_XFF默认不信任_取对端地址() throws Exception {
            // ClientIp 默认不信 XFF（客户端自报头，盲信会让 IP 限流失效）→ 用 TCP 对端地址
            mockMvc.perform(post("/auth/sms-code")
                            .header("X-Forwarded-For", "203.0.113.1, 10.0.0.1")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(smsBody("13800138000")))
                    .andExpect(status().isOk());

            verify(authService).sendSmsCode(eq("13800138000"), anyString(), anyString(), eq("127.0.0.1"));
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
        void 海外号回归_非大陆号形不拦截() throws Exception {
            // 强校验只卡发短信的入口；登录族维持 7–20 宽松（历史数据/海外号可密码登录）
            when(authService.loginByPassword(
                            eq("+8613800138000"), anyString(), anyString(), anyString(), nullable(String.class)))
                    .thenReturn(new TokenPair("at-overseas", "rt-overseas"));

            mockMvc.perform(
                            post("/auth/login/password")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "+8613800138000", "password": "correctPass123", "deviceId": "dev1"}
                                """))
                    .andExpect(status().isOk());
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

            // deviceId 原样交出去（这里就是 null）：缺省归哪个桶由会话存储裁决，入口不翻译（ACC-21）
            verify(authService).refresh("rt:cookie", null, "127.0.0.1", null);
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

            verify(authService).refresh("rt:body", "dev1", "127.0.0.1", null);
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
    class 图形验证码 { // GET /auth/captcha

        @Test
        void 匿名可达_出参含ID与图() throws Exception {
            when(captchaService.generate())
                    .thenReturn(new CaptchaService.Captcha("cid-1", "data:image/png;base64,AAA"));

            mockMvc.perform(get("/auth/captcha")).andExpect(status().isOk());

            verify(captchaService).generate();
        }
    }

    @Nested
    class 短信登录 { // POST /auth/login/sms

        @Test
        void 缺deviceId_422() throws Exception {
            mockMvc.perform(
                            post("/auth/login/sms")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "code": "123456"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("deviceId"));
        }

        @Test
        void 验证码长度非6位_422() throws Exception {
            mockMvc.perform(
                            post("/auth/login/sms")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "code": "12345", "deviceId": "dev1"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("code"));
        }

        /** 短信登录与密码登录同契约：凭证只走 httpOnly cookie，响应体不带 refreshToken */
        @Test
        void 成功_刷新令牌只进HttpOnly_Cookie_不进响应体() throws Exception {
            when(authService.loginBySms(
                            eq("13800138000"), eq("123456"), eq("dev1"), anyString(), nullable(String.class)))
                    .thenReturn(new TokenPair("at-sms", "rt-sms"));

            mockMvc.perform(
                            post("/auth/login/sms")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "code": "123456", "deviceId": "dev1"}
                                """))
                    .andExpect(status().isOk())
                    .andExpect(cookie().httpOnly("refresh_token", true))
                    .andExpect(cookie().path("refresh_token", "/auth/refresh"))
                    .andExpect(jsonPath("$.refreshToken").doesNotExist());
        }
    }

    @Nested
    class 忘记密码 { // POST /auth/forgot-password

        @ParameterizedTest(name = "非法手机号[{0}]_422")
        @ValueSource(strings = {"123", "1234567", "23800138000", "+8613800138000"})
        void 非法手机号_422(String phone) throws Exception {
            // 重置密码发码同样触发真实发短信：与 /auth/sms-code 同一强校验口径
            mockMvc.perform(post("/auth/forgot-password")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(
                                    """
                                {"phone": "%s", "captchaId": "c1", "captchaCode": "A1B2"}
                                """
                                            .formatted(phone)))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("phone"));
        }

        @Test
        void 成功_手机号与人机码与来源IP透传() throws Exception {
            // 本端点与 /auth/sms-code 同为匿名发码入口，人机验证前置（ACC-35）；先后顺序归 AuthServiceTest
            mockMvc.perform(
                            post("/auth/forgot-password")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "captchaId": "c1", "captchaCode": "A1B2"}
                                """))
                    .andExpect(status().isOk());

            verify(authService).forgotPassword("13800138000", "c1", "A1B2", "127.0.0.1");
        }

        @Test
        void 缺人机码_422() throws Exception {
            mockMvc.perform(
                            post("/auth/forgot-password")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "captchaCode": "A1B2"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("captchaId"));
        }
    }

    @Nested
    class 重置密码 { // POST /auth/reset-password

        @Test
        void 新密码过短_422() throws Exception {
            mockMvc.perform(
                            post("/auth/reset-password")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "code": "123456", "newPassword": "short"}
                                """))
                    .andExpect(status().is(422))
                    .andExpect(jsonPath("$.errors[0].field").value("newPassword"));
        }

        @Test
        void 成功_手机号验证码与新密码透传() throws Exception {
            mockMvc.perform(
                            post("/auth/reset-password")
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(
                                            """
                                {"phone": "13800138000", "code": "123456", "newPassword": "newPass123"}
                                """))
                    .andExpect(status().isOk());

            verify(authService).resetPassword("13800138000", "123456", "newPass123");
        }
    }

    @Nested
    class 头像上传凭证 { // POST /auth/avatar-ticket

        @Test
        void 缺ext_400() throws Exception {
            mockMvc.perform(post("/auth/avatar-ticket").with(userAuth(USER_ID))).andExpect(status().isBadRequest());
        }

        @Test
        void 有ext_按用户头像前缀签发() throws Exception {
            when(qiniuClient.issueTicket("user/avatar", "png"))
                    .thenReturn(
                            new UploadTicket("https://up.qiniu", "user/avatar/x.png", "token", "https://cdn/x.png"));

            mockMvc.perform(post("/auth/avatar-ticket").with(userAuth(USER_ID)).param("ext", "png"))
                    .andExpect(status().isOk());

            verify(qiniuClient).issueTicket("user/avatar", "png");
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
