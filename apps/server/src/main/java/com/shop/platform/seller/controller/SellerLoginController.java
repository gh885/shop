package com.shop.platform.seller.controller;

import com.shop.platform.seller.dto.SellerLoginRequest;
import com.shop.platform.seller.service.SellerLoginService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 卖家登录。三端各有自己的登录入口，不共用——买家的手机号+验证码、卖家的账号+密码、平台员工的账号+密码
 * 是三套认证，共用一个接口只会在分支里长出第二套认证。
 *
 * <p>一个 handler 只调一个 service 方法，判断全在 {@link SellerLoginService}。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerLoginController {

    private final SellerLoginService loginService;

    public SellerLoginController(SellerLoginService loginService) {
        this.loginService = loginService;
    }

    @PostMapping("/login")
    public SellerLoginService.LoginResult login(@Valid @RequestBody SellerLoginRequest request) {
        return loginService.login(request.loginName(), request.password());
    }
}
