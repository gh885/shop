package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.RefreshCookies;
import com.shop.platform.seller.dto.SellerLoginRequest;
import com.shop.platform.seller.service.SellerLoginService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家登录入口。三端各有自己的登录接口，不共用——三套身份域共用一个接口只会在分支里长出第二套认证。
 *
 * <p>一个 handler 只调一个 service 方法，判断全在 {@link SellerLoginService}。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerLoginController {

    static final RefreshCookies.Spec COOKIE_SPEC = new RefreshCookies.Spec("seller_refresh", "/api/seller/refresh");

    private final SellerLoginService loginService;
    private final RefreshCookies refreshCookies;
    private final ClientIp clientIp;
    private final Authorizer authorizer;

    public SellerLoginController(
            SellerLoginService loginService, RefreshCookies refreshCookies, ClientIp clientIp, Authorizer authorizer) {
        this.loginService = loginService;
        this.refreshCookies = refreshCookies;
        this.clientIp = clientIp;
        this.authorizer = authorizer;
    }

    @PostMapping("/login")
    public TokenResponse login(
            @Valid @RequestBody SellerLoginRequest request,
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
            @RequestBody(required = false) RefreshRequest request,
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
    public void logout(@RequestBody(required = false) RefreshRequest request, HttpServletResponse servletResponse) {
        loginService.logout(authorizer.current().operatorId(), request == null ? null : request.deviceId());
        refreshCookies.clear(servletResponse, COOKIE_SPEC);
    }

    private TokenResponse issue(SellerLoginService.LoginResult result, HttpServletResponse servletResponse) {
        refreshCookies.issue(servletResponse, COOKIE_SPEC, result.refreshToken());
        return new TokenResponse(result.accessToken(), result.expiresIn());
    }

    /** 出参只带 access；refresh 走 cookie，不出响应体 */
    public record TokenResponse(String accessToken, long expiresIn) {}

    public record RefreshRequest(String deviceId) {}
}
