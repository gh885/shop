package com.shop.platform.account.controller;

import com.shop.platform.account.api.AccountQuery;
import com.shop.platform.account.dto.BuyerLoginRequest;
import com.shop.platform.account.dto.BuyerRegisterRequest;
import com.shop.platform.account.dto.ForgotPasswordRequest;
import com.shop.platform.account.dto.LogoutRequest;
import com.shop.platform.account.dto.RefreshRequest;
import com.shop.platform.account.dto.ResetPasswordRequest;
import com.shop.platform.account.dto.SmsCodeRequest;
import com.shop.platform.account.dto.SmsLoginRequest;
import com.shop.platform.account.internal.CaptchaService;
import com.shop.platform.account.service.BuyerAuthService;
import com.shop.platform.account.service.BuyerLocaleService;
import com.shop.platform.account.service.BuyerSessionService;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.RefreshCookies;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家认证入口。三端各有自己的登录接口，<b>不共用</b>——三套身份域共用一个接口只会在分支里长出第二套认证。
 *
 * <p>登录/注册/发码/刷新都在 {@code PUBLIC_PATHS} 里：匿名接口。它们的安全边界是「不泄露账号是否存在」，
 * 不是「要求已登录」。
 *
 * <p>refresh token 只在 httpOnly cookie 与轮换端点之间流动（path 收窄到 /refresh），
 * 响应体只带 access token——能拿到 refresh 的只有浏览器自己。
 */
@RestController
@RequestMapping("/api/buyer")
public class BuyerAuthController {

    /** 买家端 refresh cookie 身份。path 收窄到轮换端点：cookie 不随普通 API 请求外发。 */
    static final RefreshCookies.Spec COOKIE_SPEC = new RefreshCookies.Spec("buyer_refresh", "/api/buyer/refresh");

    private final BuyerAuthService auth;
    private final BuyerSessionService sessions;
    private final BuyerLocaleService locale;
    private final AccountQuery accounts;
    private final Authorizer authorizer;
    private final ClientIp clientIp;
    private final RefreshCookies refreshCookies;
    private final CaptchaService captchaService;

    public BuyerAuthController(
            BuyerAuthService auth,
            BuyerSessionService sessions,
            BuyerLocaleService locale,
            AccountQuery accounts,
            Authorizer authorizer,
            ClientIp clientIp,
            RefreshCookies refreshCookies,
            CaptchaService captchaService) {
        this.auth = auth;
        this.sessions = sessions;
        this.locale = locale;
        this.accounts = accounts;
        this.authorizer = authorizer;
        this.clientIp = clientIp;
        this.refreshCookies = refreshCookies;
        this.captchaService = captchaService;
    }

    @PostMapping("/register")
    public TokenResponse register(
            @Valid @RequestBody BuyerRegisterRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        return issue(
                auth.register(
                        request.phone(),
                        request.password(),
                        request.displayName(),
                        null,
                        clientIp.of(servletRequest),
                        servletRequest.getHeader("User-Agent")),
                servletResponse);
    }

    @PostMapping("/login")
    public TokenResponse buyerLogin(
            @Valid @RequestBody BuyerLoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        return issue(
                auth.loginByPassword(
                        request.phone(),
                        request.password(),
                        request.deviceId(),
                        clientIp.of(servletRequest),
                        servletRequest.getHeader("User-Agent")),
                servletResponse);
    }

    /** 短信验证码登录/注册（没号自动建号）。deviceId 现阶段没有采集容器，恒 null（归 default 桶）。 */
    @PostMapping("/login/sms")
    public TokenResponse loginBySms(
            @Valid @RequestBody SmsLoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        return issue(
                auth.loginBySms(
                        request.phone(),
                        request.code(),
                        null,
                        clientIp.of(servletRequest),
                        servletRequest.getHeader("User-Agent")),
                servletResponse);
    }

    /** 发送登录短信验证码（人机验证 → 频控 → OTP 的防线顺序在 service） */
    @PostMapping("/sms-code")
    public void sendSmsCode(@Valid @RequestBody SmsCodeRequest request, HttpServletRequest servletRequest) {
        auth.sendSmsCode(request.phone(), request.captchaId(), request.captchaCode(), clientIp.of(servletRequest));
    }

    /** 发放图形验证码（匿名可达） */
    @GetMapping("/captcha")
    public CaptchaService.Captcha captcha() {
        return captchaService.generate();
    }

    /** 发送找回密码验证码（同样先过人机验证） */
    @PostMapping("/forgot-password")
    public void forgotPassword(@Valid @RequestBody ForgotPasswordRequest request, HttpServletRequest servletRequest) {
        auth.forgotPassword(request.phone(), request.captchaId(), request.captchaCode(), clientIp.of(servletRequest));
    }

    /** 凭重置验证码设置新密码 */
    @PostMapping("/reset-password")
    public void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        auth.resetPassword(request.phone(), request.code(), request.newPassword());
    }

    /**
     * 刷新双 token（轮换 + 重放裁决在 RefreshTokenStore）。旧码一次一换：新 refresh 经 Set-Cookie 下发。
     * 410 + REFRESH_TOKEN_REUSED 表示重放裁决判了盗用、全部设备已下线。
     */
    @PostMapping("/refresh")
    public TokenResponse buyerRefresh(
            @RequestBody(required = false) RefreshRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        String refreshToken = refreshCookies.requireToken(servletRequest, COOKIE_SPEC);
        BuyerAuthService.Session session = sessions.refresh(
                refreshToken,
                request == null ? null : request.deviceId(),
                clientIp.of(servletRequest),
                servletRequest.getHeader("User-Agent"));
        return issue(session, servletResponse);
    }

    /** 登出当前设备（删 refresh + 清 cookie）。access 到期前仍有效，属已接受取舍。 */
    @PostMapping("/logout")
    public void buyerLogout(
            @Valid @RequestBody LogoutRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        sessions.logout(authorizer.current().operatorId(), request.deviceId());
        refreshCookies.clear(servletResponse, COOKIE_SPEC);
    }

    /**
     * 我是谁。前端刷新页面后用它恢复登录态，顺带拿到展示名。
     *
     * <p>不需要额外判权：能走到这里说明令牌有效且买家还在用（身份解析按 status + deleted_at 拒人）。
     */
    @GetMapping("/me")
    public Me buyerMe() {
        UUID buyerId = authorizer.current().operatorId();
        AccountQuery.BuyerState state = accounts.find(buyerId)
                // 令牌有效但库里查不到，说明刚好被注销/停用；这属于身份失效，不是 404
                .orElseThrow(() -> BusinessException.unauthorized("账号不存在或已停用"));
        return new Me(state.buyerId(), state.displayName(), locale.find(buyerId));
    }

    private TokenResponse issue(BuyerAuthService.Session session, HttpServletResponse servletResponse) {
        refreshCookies.issue(servletResponse, COOKIE_SPEC, session.refreshToken());
        return new TokenResponse(session.accessToken(), session.expiresIn());
    }

    /** 登录/刷新的 HTTP 出参：只带 access。refresh 走 cookie，不出响应体。 */
    public record TokenResponse(String accessToken, long expiresIn) {}

    /**
     * 我是谁。{@code preferredLocale} 可空 = 没表过态（前端落平台默认，不认成"选了默认语言"）。
     */
    public record Me(UUID buyerId, String displayName, @Schema(nullable = true) String preferredLocale) {}
}
