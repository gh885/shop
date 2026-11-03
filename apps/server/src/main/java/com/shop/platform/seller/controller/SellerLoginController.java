package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Public;
import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.RefreshCookies;
import com.shop.platform.seller.dto.SellerLoginRequest;
import com.shop.platform.seller.dto.UpdateSellerLocaleRequest;
import com.shop.platform.seller.service.SellerLocaleService;
import com.shop.platform.seller.service.SellerLoginService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家认证入口。三端各有自己的登录接口，不共用——三套身份域共用一个接口只会在分支里长出第二套认证。
 *
 * <p>一个 handler 只调一个 service 方法，判断全在 {@link SellerLoginService}。
 * {@code /locale} 与登录同住一个 controller：它认的是同一套 cookie 与同一个身份。
 * {@code /me} 不在这里——它有自己的 controller（{@code SellerMeController}），
 * 那边还要查店铺，形状不一样。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerLoginController {

    static final RefreshCookies.Spec COOKIE_SPEC = new RefreshCookies.Spec("seller_refresh", "/api/seller/refresh");

    private final SellerLoginService loginService;
    private final SellerLocaleService localeService;
    private final RefreshCookies refreshCookies;
    private final ClientIp clientIp;
    private final Authorizer authorizer;

    public SellerLoginController(
            SellerLoginService loginService,
            SellerLocaleService localeService,
            RefreshCookies refreshCookies,
            ClientIp clientIp,
            Authorizer authorizer) {
        this.loginService = loginService;
        this.localeService = localeService;
        this.refreshCookies = refreshCookies;
        this.clientIp = clientIp;
        this.authorizer = authorizer;
    }

    @Public
    @PostMapping("/login")
    public TokenResponse sellerLogin(
            @Valid @RequestBody SellerLoginRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        return issue(
                loginService.login(
                        request.loginName(),
                        request.password(),
                        request.deviceId(),
                        clientIp.of(servletRequest),
                        servletRequest.getHeader("User-Agent")),
                servletResponse);
    }

    /** 刷新双 token（轮换 + 重放裁决在 RefreshTokenStore）。 */
    @Public
    @PostMapping("/refresh")
    public TokenResponse sellerRefresh(
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
    public void sellerLogout(
            @RequestBody(required = false) RefreshRequest request, HttpServletResponse servletResponse) {
        authorizer.seller();
        loginService.logout(authorizer.current().operatorId(), request == null ? null : request.deviceId());
        refreshCookies.clear(servletResponse, COOKIE_SPEC);
    }

    /** 改语言偏好。返回归一后的标签，前端拿它回写本地 cookie。 */
    @PutMapping("/locale")
    public LocaleUpdated updateSellerLocale(@Valid @RequestBody UpdateSellerLocaleRequest request) {
        authorizer.seller();
        return new LocaleUpdated(localeService.updateLocale(authorizer.current(), request));
    }

    public record LocaleUpdated(String preferredLocale) {}

    private TokenResponse issue(SellerLoginService.LoginResult result, HttpServletResponse servletResponse) {
        refreshCookies.issue(servletResponse, COOKIE_SPEC, result.refreshToken());
        return new TokenResponse(result.accessToken(), result.expiresIn());
    }

    /** 出参只带 access；refresh 走 cookie，不出响应体 */
    public record TokenResponse(String accessToken, long expiresIn) {}

    public record RefreshRequest(String deviceId) {}
}
