package com.shop.platform.auth.controller;

import com.shop.platform.auth.service.AuthService;
import com.shop.platform.auth.service.AuthService.MeResponse;
import com.shop.platform.auth.service.AuthService.TokenResult;
import com.shop.platform.auth.service.SmsCodeService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.UserIdHolder;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Duration;
import java.util.Arrays;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String REFRESH_COOKIE = "refresh_token";
    private static final long REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天秒数

    private final SmsCodeService smsCodeService;
    private final AuthService authService;

    /** 发送短信验证码 */
    @PostMapping("/sms-code")
    public void sendSmsCode(
            @Valid @RequestBody SmsCodeRequest req, HttpServletRequest servletRequest) {
        smsCodeService.sendCode(req.phone(), getClientIp(servletRequest));
    }

    /** 短信验证码登录/注册 */
    @PostMapping("/login/sms")
    public TokenResult loginBySms(
            @Valid @RequestBody SmsLoginRequest req,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        TokenResult result =
                authService.loginBySms(
                        req.phone(), req.code(), req.deviceId(), getClientIp(servletRequest));
        setRefreshCookie(servletResponse, result.refreshToken());
        return result;
    }

    /** 密码登录 */
    @PostMapping("/login/password")
    public TokenResult loginByPassword(
            @Valid @RequestBody PasswordLoginRequest req,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        TokenResult result =
                authService.loginByPassword(
                        req.phone(), req.password(), req.deviceId(), getClientIp(servletRequest));
        setRefreshCookie(servletResponse, result.refreshToken());
        return result;
    }

    /** 首次设置密码（无旧密码）或修改密码（需当前密码，RESET-05） */
    @PostMapping("/password")
    public void setPassword(@Valid @RequestBody SetPasswordRequest req) {
        UUID userId = UserIdHolder.get();
        authService.setPassword(userId, req.currentPassword(), req.newPassword());
    }

    /** 发送重置密码验证码 */
    @PostMapping("/forgot-password")
    public void forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest req, HttpServletRequest servletRequest) {
        authService.forgotPassword(req.phone(), getClientIp(servletRequest));
    }

    /** 使用重置 token 设置新密码 */
    @PostMapping("/reset-password")
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        authService.resetPassword(req.phone(), req.token(), req.newPassword());
    }

    /** 刷新双 token（STORE-02: Cookie + Body 双来源） */
    @PostMapping("/refresh")
    public TokenResult refresh(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestBody(required = false) RefreshRequest req) {
        String refreshToken = resolveRefreshToken(request, req);
        if (refreshToken == null) {
            throw new BusinessException(401, "INVALID_TOKEN", "Refresh Token 未提供");
        }
        String deviceId = req != null && req.deviceId() != null ? req.deviceId() : "default";

        TokenResult result = authService.refresh(refreshToken, deviceId);
        setRefreshCookie(response, result.refreshToken());
        return result;
    }

    /** 当前登录用户信息 */
    @GetMapping("/me")
    public MeResponse me() {
        UUID userId = UserIdHolder.get();
        return authService.getMe(userId);
    }

    /** 登出（STORE-02: 清除 Cookie） */
    @PostMapping("/logout")
    public void logout(
            HttpServletRequest request,
            HttpServletResponse response,
            @Valid @RequestBody LogoutRequest req) {
        UUID userId = UserIdHolder.get();
        authService.logout(userId, req.deviceId());
        clearRefreshCookie(response);
    }

    // ---- Cookie 处理 ----

    private void setRefreshCookie(HttpServletResponse response, String refreshToken) {
        response.addHeader(
                HttpHeaders.SET_COOKIE,
                buildRefreshCookie(refreshToken, REFRESH_COOKIE_MAX_AGE).toString());
    }

    private void clearRefreshCookie(HttpServletResponse response) {
        response.addHeader(HttpHeaders.SET_COOKIE, buildRefreshCookie("", 0).toString());
    }

    private ResponseCookie buildRefreshCookie(String value, long maxAgeSec) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path("/auth/refresh")
                .maxAge(Duration.ofSeconds(maxAgeSec))
                .build();
    }

    /** Cookie → Body 依次尝试获取 refresh token */
    private String resolveRefreshToken(HttpServletRequest request, RefreshRequest req) {
        if (request.getCookies() != null) {
            String fromCookie =
                    Arrays.stream(request.getCookies())
                            .filter(c -> REFRESH_COOKIE.equals(c.getName()))
                            .map(Cookie::getValue)
                            .findFirst()
                            .orElse(null);
            if (fromCookie != null) return fromCookie;
        }
        return req != null ? req.refreshToken() : null;
    }

    // ---- IP 提取 ----

    private static String getClientIp(HttpServletRequest request) {
        String xfHeader = request.getHeader("X-Forwarded-For");
        if (xfHeader != null && !xfHeader.isEmpty() && !"unknown".equalsIgnoreCase(xfHeader)) {
            return xfHeader.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    // ---- Request DTOs ----

    public record SmsCodeRequest(@NotBlank @Size(min = 7, max = 20) String phone) {
        public SmsCodeRequest {
            if (phone != null) phone = phone.trim();
        }
    }

    public record SmsLoginRequest(
            @NotBlank @Size(min = 7, max = 20) String phone,
            @NotBlank @Size(min = 6, max = 6) String code,
            @NotBlank @Size(max = 100) String deviceId) {
        public SmsLoginRequest {
            if (phone != null) phone = phone.trim();
        }
    }

    public record PasswordLoginRequest(
            @NotBlank @Size(min = 7, max = 20) String phone,
            @NotBlank @Size(min = 8, max = 72) String password,
            @NotBlank @Size(max = 100) String deviceId) {
        public PasswordLoginRequest {
            if (phone != null) phone = phone.trim();
        }
    }

    public record SetPasswordRequest(
            @Size(max = 72) String currentPassword,
            @NotBlank @Size(min = 8, max = 72) String newPassword) {}

    public record ForgotPasswordRequest(@NotBlank @Size(min = 7, max = 20) String phone) {
        public ForgotPasswordRequest {
            if (phone != null) phone = phone.trim();
        }
    }

    public record ResetPasswordRequest(
            @NotBlank @Size(min = 7, max = 20) String phone,
            @NotBlank @Size(min = 1, max = 200) String token,
            @NotBlank @Size(min = 8, max = 72) String newPassword) {
        public ResetPasswordRequest {
            if (phone != null) phone = phone.trim();
        }
    }

    public record RefreshRequest(
            @Size(max = 200) String refreshToken, @Size(max = 100) String deviceId) {}

    public record LogoutRequest(@NotBlank @Size(max = 100) String deviceId) {}
}
