package com.shop.platform.seller.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家登录。三端各有自己的登录入口，不共用——买家的手机号+验证码、卖家的账号+密码、平台员工的账号+密码
 * 是三套认证，共用一个接口只会在分支里长出第二套认证。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerLoginController {

    private final SellerLoginService loginService;

    public SellerLoginController(SellerLoginService loginService) {
        this.loginService = loginService;
    }

    @PostMapping("/login")
    public SellerLoginService.LoginResult login(@Valid @RequestBody LoginRequest request) {
        return loginService.login(request.loginName(), request.password());
    }

    public record LoginRequest(@NotBlank String loginName, @NotBlank String password) {}
}
