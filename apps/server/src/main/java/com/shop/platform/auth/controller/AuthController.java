package com.shop.platform.auth.controller;

import com.shop.platform.auth.dto.ForgotPasswordRequest;
import com.shop.platform.auth.dto.LogoutRequest;
import com.shop.platform.auth.dto.PasswordLoginRequest;
import com.shop.platform.auth.dto.RefreshRequest;
import com.shop.platform.auth.dto.ResetPasswordRequest;
import com.shop.platform.auth.dto.SetPasswordRequest;
import com.shop.platform.auth.dto.SmsCodeRequest;
import com.shop.platform.auth.dto.SmsLoginRequest;
import com.shop.platform.auth.dto.UpdateProfileRequest;
import com.shop.platform.auth.mapper.User;
import com.shop.platform.auth.service.AuthService;
import com.shop.platform.auth.service.SmsCodeService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.captcha.CaptchaService;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.infra.web.ClientIp;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String REFRESH_COOKIE = "refresh_token";
    private static final long REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 天秒数

    private final SmsCodeService smsCodeService;
    private final AuthService authService;
    private final CaptchaService captchaService;
    private final ClientIp clientIp;

    /** 发送短信验证码 */
    @PostMapping("/sms-code")
    public void sendSmsCode(@Valid @RequestBody SmsCodeRequest req, HttpServletRequest servletRequest) {
        // 人机验证前置：脚本直调 /sms-code 短信轰炸前必须过图形验证码（防线顺序：人机验证 → 频控 → OTP）
        captchaService.verify(req.captchaId(), req.captchaCode());
        smsCodeService.sendCode(req.phone(), clientIp.of(servletRequest));
    }

    /** 发放图形验证码（匿名可达，见 JwtProperties.skipPaths） */
    @GetMapping("/captcha")
    public CaptchaResponse captcha() {
        CaptchaService.Captcha captcha = captchaService.generate();
        return new CaptchaResponse(captcha.captchaId(), captcha.image());
    }

    /** 短信验证码登录/注册 */
    @PostMapping("/login/sms")
    public TokenPair loginBySms(
            @Valid @RequestBody SmsLoginRequest req,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        TokenPair result = authService.loginBySms(
                req.phone(), req.code(), req.deviceId(), clientIp.of(servletRequest), userAgent(servletRequest));
        setRefreshCookie(servletResponse, result.refreshToken());
        return result;
    }

    /** 密码登录 */
    @PostMapping("/login/password")
    public TokenPair loginByPassword(
            @Valid @RequestBody PasswordLoginRequest req,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        TokenPair result = authService.loginByPassword(
                req.phone(), req.password(), req.deviceId(), clientIp.of(servletRequest), userAgent(servletRequest));
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
    public void forgotPassword(@Valid @RequestBody ForgotPasswordRequest req, HttpServletRequest servletRequest) {
        authService.forgotPassword(req.phone(), clientIp.of(servletRequest));
    }

    /** 使用重置 token 设置新密码 */
    @PostMapping("/reset-password")
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        authService.resetPassword(req.phone(), req.code(), req.newPassword());
    }

    /** 刷新双 token（STORE-02: Cookie + Body 双来源） */
    @PostMapping("/refresh")
    public TokenPair refresh(
            HttpServletRequest request,
            HttpServletResponse response,
            @RequestBody(required = false) RefreshRequest req) {
        String refreshToken = resolveRefreshToken(request, req);
        if (refreshToken == null) {
            throw new BusinessException(401, "INVALID_TOKEN", "Refresh Token 未提供");
        }
        String deviceId = req != null && req.deviceId() != null ? req.deviceId() : "default";

        TokenPair result = authService.refresh(refreshToken, deviceId, clientIp.of(request), userAgent(request));
        setRefreshCookie(response, result.refreshToken());
        return result;
    }

    /** 当前登录用户信息 */
    @GetMapping("/me")
    public MeResponse me() {
        UUID userId = UserIdHolder.get();
        User user = authService.getMe(userId);
        return new MeResponse(user.getId(), PhoneNumber.mask(user.getPhone()), user.getNickname(), user.getAvatarKey());
    }

    /** 登出（STORE-02: 清除 Cookie） */
    @PostMapping("/logout")
    public void logout(
            HttpServletRequest request, HttpServletResponse response, @Valid @RequestBody LogoutRequest req) {
        UUID userId = UserIdHolder.get();
        authService.logout(userId, req.deviceId());
        clearRefreshCookie(response);
    }

    /** 更新个人资料（本期仅昵称；头像上传未做，不在此改） */
    @PutMapping("/profile")
    public MeResponse updateProfile(@Valid @RequestBody UpdateProfileRequest req) {
        UUID userId = UserIdHolder.get();
        User user = authService.updateProfile(userId, req.nickname());
        return new MeResponse(user.getId(), PhoneNumber.mask(user.getPhone()), user.getNickname(), user.getAvatarKey());
    }

    /** 登出所有设备（清空全端会话，当前请求也失效，需重新登录） */
    @PostMapping("/logout-all")
    public void logoutAll() {
        UUID userId = UserIdHolder.get();
        authService.logoutAll(userId);
    }

    /** 设备列表：展示当前有效会话（设备名/IP/时间），当前设备标记 isCurrent */
    @GetMapping("/devices")
    public List<DeviceEntryResponse> devices(@RequestParam(required = false) String currentDeviceId) {
        UUID userId = UserIdHolder.get();
        return authService.listDevices(userId, currentDeviceId).stream()
                .map(entry -> new DeviceEntryResponse(
                        entry.deviceId(),
                        entry.info().deviceName(),
                        entry.info().ip(),
                        entry.info().lastLoginAt(),
                        entry.deviceId().equals(currentDeviceId)))
                .toList();
    }

    /** 登出单台设备 */
    @DeleteMapping("/devices/{deviceId}")
    public void deleteDevice(@PathVariable String deviceId) {
        UUID userId = UserIdHolder.get();
        authService.deleteDevice(userId, deviceId);
    }

    // ---- 请求工具 ----

    /** User-Agent 头（可能为 null，用于设备名解析） */
    private String userAgent(HttpServletRequest request) {
        return request.getHeader("User-Agent");
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
            String fromCookie = Arrays.stream(request.getCookies())
                    .filter(c -> REFRESH_COOKIE.equals(c.getName()))
                    .map(Cookie::getValue)
                    .findFirst()
                    .orElse(null);
            if (fromCookie != null) return fromCookie;
        }
        return req != null ? req.refreshToken() : null;
    }

    // ---- Response DTOs ----

    /** 当前登录用户信息（手机号已脱敏） */
    public record MeResponse(UUID id, String phone, String nickname, String avatarKey) {}

    /** 图形验证码出参：前端渲染图（base64 data URI），校验时回传 id + 用户输入 */
    public record CaptchaResponse(String captchaId, String image) {}

    /** 设备列表项：deviceId + 元数据（设备名/IP/最近活跃）+ 是否当前设备 */
    public record DeviceEntryResponse(
            String deviceId, String deviceName, String ip, OffsetDateTime lastLoginAt, boolean isCurrent) {}
}
