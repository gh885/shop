package com.shop.platform.auth.controller;

import com.shop.platform.auth.AuthProperties;
import com.shop.platform.auth.controller.response.AvatarTicketResponse;
import com.shop.platform.auth.controller.response.CaptchaResponse;
import com.shop.platform.auth.controller.response.DeviceEntryResponse;
import com.shop.platform.auth.controller.response.MeResponse;
import com.shop.platform.auth.dto.ForgotPasswordRequest;
import com.shop.platform.auth.dto.LogoutRequest;
import com.shop.platform.auth.dto.PasswordLoginRequest;
import com.shop.platform.auth.dto.RefreshRequest;
import com.shop.platform.auth.dto.ResetPasswordRequest;
import com.shop.platform.auth.dto.SetPasswordRequest;
import com.shop.platform.auth.dto.SmsCodeRequest;
import com.shop.platform.auth.dto.SmsLoginRequest;
import com.shop.platform.auth.dto.UpdateProfileRequest;
import com.shop.platform.auth.service.AuthService;
import com.shop.platform.auth.service.SmsCodeService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.captcha.CaptchaService;
import com.shop.platform.infra.qiniu.QiniuClient;
import com.shop.platform.infra.security.TokenPair;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.CurrentUser;
import com.shop.platform.infra.web.RefreshCookies;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "auth", description = "买家账号认证与个人资料")
@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final SmsCodeService smsCodeService;
    private final AuthService authService;
    private final CaptchaService captchaService;
    private final QiniuClient qiniuClient;
    private final ClientIp clientIp;
    private final RefreshCookies refreshCookies;
    private final AuthProperties authProperties;

    /**
     * 买家端 refresh cookie 身份。domain 留空 = 不设 domain（单站点，如本地 localhost）；
     * 生产配置成共享父域（如 .example.com）后，买家端(web)与卖家端(seller)共用同一个
     * refresh cookie —— 登录一处另一处自动登录（淘宝千牛式共享会话 / 轻量单点登录）。
     * 注意：admin 走独立 staff 账号体系与 C 端隔离，不纳入共享。
     */
    private RefreshCookies.Spec cookieSpec() {
        return new RefreshCookies.Spec("refresh_token", "/auth/refresh", authProperties.refreshCookieDomain());
    }

    /** 发送短信验证码 */
    @PostMapping("/sms-code")
    public void sendSmsCode(@Valid @RequestBody SmsCodeRequest req, HttpServletRequest servletRequest) {
        // 人机验证前置：脚本直调 /sms-code 短信轰炸前必须过图形验证码（防线顺序：人机验证 → 频控 → OTP）
        captchaService.verify(req.captchaId(), req.captchaCode());
        smsCodeService.sendCode(req.phone(), clientIp.of(servletRequest));
    }

    /** 发放图形验证码（匿名可达，见 JwtProperties.skipPaths） */
    @GetMapping("/captcha")
    public CaptchaResponse getCaptcha() {
        CaptchaService.Captcha captcha = captchaService.generate();
        return new CaptchaResponse(captcha.captchaId(), captcha.image());
    }

    /** 短信验证码登录/注册 */
    @PostMapping("/login/sms")
    public TokenPair loginBySms(
            @Valid @RequestBody SmsLoginRequest req,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        TokenPair result =
                authService.loginBySms(req.phone(), req.code(), req.deviceId(), clientIp.of(servletRequest), userAgent);
        refreshCookies.issue(servletResponse, cookieSpec(), result.refreshToken());
        return result;
    }

    /** 密码登录 */
    @PostMapping("/login/password")
    public TokenPair loginByPassword(
            @Valid @RequestBody PasswordLoginRequest req,
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        TokenPair result = authService.loginByPassword(
                req.phone(), req.password(), req.deviceId(), clientIp.of(servletRequest), userAgent);
        refreshCookies.issue(servletResponse, cookieSpec(), result.refreshToken());
        return result;
    }

    /** 首次设置密码（无旧密码）或修改密码（需当前密码，RESET-05） */
    @PostMapping("/password")
    public void setPassword(@CurrentUser UUID userId, @Valid @RequestBody SetPasswordRequest req) {
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
            @RequestHeader(value = HttpHeaders.USER_AGENT, required = false) String userAgent,
            @RequestBody(required = false) RefreshRequest req) {
        // Cookie 优先、Body 兜底：web 走 httpOnly cookie，原生端无 cookie 容器只能走 body
        String fromCookie = refreshCookies.read(request, cookieSpec());
        String refreshToken = fromCookie != null ? fromCookie : (req == null ? null : req.refreshToken());
        if (refreshToken == null) {
            throw new BusinessException(401, "INVALID_TOKEN", "Refresh Token 未提供");
        }

        TokenPair result = authService.refresh(refreshToken, deviceIdOrDefault(req), clientIp.of(request), userAgent);
        refreshCookies.issue(response, cookieSpec(), result.refreshToken());
        return result;
    }

    /** 当前登录用户信息 */
    @GetMapping("/me")
    public MeResponse me(@CurrentUser UUID userId) {
        return MeResponse.from(authService.getMe(userId));
    }

    /** 头像上传凭证：前端拿 ticket 后直传七牛，传完把 key 随更新资料（avatarKey）保存 */
    @PostMapping("/avatar-ticket")
    public AvatarTicketResponse issueAvatarTicket(@RequestParam String ext) {
        return AvatarTicketResponse.from(qiniuClient.issueTicket("user/avatar", ext));
    }

    /** 登出（STORE-02: 清除 Cookie） */
    @PostMapping("/logout")
    public void logout(@CurrentUser UUID userId, @Valid @RequestBody LogoutRequest req, HttpServletResponse response) {
        authService.logout(userId, req.deviceId());
        refreshCookies.clear(response, cookieSpec());
    }

    /** 更新个人资料（昵称 + 头像） */
    @PutMapping("/profile")
    public MeResponse updateProfile(@CurrentUser UUID userId, @Valid @RequestBody UpdateProfileRequest req) {
        return MeResponse.from(authService.updateProfile(userId, req.nickname(), req.avatarKey()));
    }

    /** 登出所有设备（清空全端会话，当前请求也失效，需重新登录） */
    @PostMapping("/logout-all")
    public void logoutAll(@CurrentUser UUID userId) {
        authService.logoutAll(userId);
    }

    /** 设备列表：展示当前有效会话（设备名/IP/时间），当前设备标记 isCurrent */
    @GetMapping("/devices")
    public List<DeviceEntryResponse> devices(
            @CurrentUser UUID userId, @RequestParam(required = false) String currentDeviceId) {
        return authService.listDevices(userId, currentDeviceId).stream()
                .map(entry -> DeviceEntryResponse.from(entry, currentDeviceId))
                .toList();
    }

    /** 登出单台设备 */
    @DeleteMapping("/devices/{deviceId}")
    public void deleteDevice(@CurrentUser UUID userId, @PathVariable String deviceId) {
        authService.deleteDevice(userId, deviceId);
    }

    /** 刷新请求可不带 body（web 走 cookie），deviceId 缺省归入 "default" 桶 */
    private static String deviceIdOrDefault(RefreshRequest req) {
        return req == null || req.deviceId() == null ? "default" : req.deviceId();
    }

    // ---- Response DTOs ----

}
