package com.shop.platform.staff.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.RefreshCookies;
import com.shop.platform.staff.dto.StaffLoginRequest;
import com.shop.platform.staff.dto.StaffRefreshRequest;
import com.shop.platform.staff.service.StaffLoginService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台员工认证入口。第三套身份域，与买家、卖家各自独立。
 *
 * <p>refresh token 走独立命名的 httpOnly cookie（与买家 cookie 不互覆），path 收窄到轮换端点。
 */
@RestController
@RequestMapping("/api/staff")
public class StaffLoginController {

    static final RefreshCookies.Spec COOKIE_SPEC = new RefreshCookies.Spec("staff_refresh", "/api/staff/refresh");

    private final StaffLoginService loginService;
    private final RefreshCookies refreshCookies;
    private final ClientIp clientIp;
    private final Authorizer authorizer;

    public StaffLoginController(
            StaffLoginService loginService, RefreshCookies refreshCookies, ClientIp clientIp, Authorizer authorizer) {
        this.loginService = loginService;
        this.refreshCookies = refreshCookies;
        this.clientIp = clientIp;
        this.authorizer = authorizer;
    }

    @PostMapping("/login")
    public TokenResponse login(
            @Valid @RequestBody StaffLoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        return issue(
                loginService.login(
                        request.loginName(),
                        request.password(),
                        clientIp.of(servletRequest),
                        servletRequest.getHeader("User-Agent")),
                servletResponse);
    }

    /** 刷新双 token（轮换 + 重放裁决在 RefreshTokenStore）。 */
    @PostMapping("/refresh")
    public TokenResponse refresh(
            @RequestBody(required = false) StaffRefreshRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        String refreshToken = refreshCookies.requireToken(servletRequest, COOKIE_SPEC);
        return issue(
                loginService.refresh(
                        refreshToken,
                        request == null ? null : request.deviceId(),
                        clientIp.of(servletRequest),
                        servletRequest.getHeader("User-Agent")),
                servletResponse);
    }

    /** 登出当前设备 */
    @PostMapping("/logout")
    public void logout(
            @RequestBody(required = false) StaffRefreshRequest request, HttpServletResponse servletResponse) {
        loginService.logout(authorizer.current().operatorId(), request == null ? null : request.deviceId());
        refreshCookies.clear(servletResponse, COOKIE_SPEC);
    }

    private TokenResponse issue(StaffLoginService.LoginResult result, HttpServletResponse servletResponse) {
        refreshCookies.issue(servletResponse, COOKIE_SPEC, result.refreshToken());
        return new TokenResponse(result.accessToken(), result.expiresIn());
    }

    /** 出参只带 access；refresh 走 cookie，不出响应体 */
    public record TokenResponse(String accessToken, long expiresIn) {}
}
