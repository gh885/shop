package com.shop.platform.seller.controller;

import com.shop.platform.infra.web.ClientIp;
import com.shop.platform.infra.web.RefreshCookies;
import com.shop.platform.seller.dto.SellerRegisterRequest;
import com.shop.platform.seller.service.SellerLoginService;
import com.shop.platform.seller.service.SellerOnboardingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家注册（匿名）。注册即成立身份并签发会话——省一次登录往返，与买家注册同口径；
 * 但身份不等于资格，能否卖由治理侧的入驻审核决定，前端按 {@code /me} 的 onboarding 状态引导。
 *
 * <p>与登录共用同一套 refresh cookie 规格与限流（限流在 {@code SellerOnboardingService} 内），
 * 匿名写入口不额外开第三种形态。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerRegisterController {

    private final SellerOnboardingService onboarding;
    private final SellerLoginService loginService;
    private final RefreshCookies refreshCookies;
    private final ClientIp clientIp;

    public SellerRegisterController(
            SellerOnboardingService onboarding,
            SellerLoginService loginService,
            RefreshCookies refreshCookies,
            ClientIp clientIp) {
        this.onboarding = onboarding;
        this.loginService = loginService;
        this.refreshCookies = refreshCookies;
        this.clientIp = clientIp;
    }

    @PostMapping("/register")
    public SellerLoginController.TokenResponse register(
            @Valid @RequestBody SellerRegisterRequest request,
            HttpServletRequest servletRequest,
            HttpServletResponse servletResponse) {
        SellerOnboardingService.Registration registration = onboarding.register(
                request.name().trim(), request.loginName().trim(), request.password(), clientIp.of(servletRequest));
        SellerLoginService.LoginResult result = loginService.issueSession(
                registration.operatorId(),
                registration.merchantId(),
                clientIp.of(servletRequest),
                servletRequest.getHeader("User-Agent"));
        refreshCookies.issue(servletResponse, SellerLoginController.COOKIE_SPEC, result.refreshToken());
        return new SellerLoginController.TokenResponse(result.accessToken(), result.expiresIn());
    }
}
