package com.shop.platform.account.controller;

import com.shop.platform.account.api.AccountQuery;
import com.shop.platform.account.dto.BuyerLoginRequest;
import com.shop.platform.account.dto.BuyerRegisterRequest;
import com.shop.platform.account.service.BuyerAuthService;
import com.shop.platform.infra.security.Authorizer;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 买家登录入口。三端各有自己的登录接口，<b>不共用</b>——买家的手机号+密码、卖家的账号+密码、
 * 平台员工的账号+密码是三套认证，共用一个接口只会在分支里长出第二套认证。
 *
 * <p>注册和登录都在 {@code PUBLIC_PATHS} 里：匿名接口。它们的安全边界是"不泄露账号是否存在"，
 * 不是"要求已登录"。
 */
@RestController
@RequestMapping("/api/buyer")
public class BuyerAuthController {

    private final BuyerAuthService auth;
    private final AccountQuery accounts;
    private final Authorizer authorizer;

    public BuyerAuthController(BuyerAuthService auth, AccountQuery accounts, Authorizer authorizer) {
        this.auth = auth;
        this.accounts = accounts;
        this.authorizer = authorizer;
    }

    @PostMapping("/register")
    public BuyerAuthService.LoginResult register(@Valid @RequestBody BuyerRegisterRequest request) {
        return auth.register(request.phone(), request.password(), request.nickname());
    }

    @PostMapping("/login")
    public BuyerAuthService.LoginResult login(@Valid @RequestBody BuyerLoginRequest request) {
        return auth.login(request.phone(), request.password());
    }

    /**
     * 我是谁。前端刷新页面后用它恢复登录态，顺带拿到展示名。
     *
     * <p>不需要额外判权：能走到这里说明令牌有效且买家还在用，{@code authorizer.current()}
     * 已经把身份解出来了。
     */
    @GetMapping("/me")
    public Me me() {
        UUID buyerId = authorizer.current().operatorId();
        AccountQuery.BuyerState state = accounts.find(buyerId)
                // 令牌有效但库里查不到，说明刚好被删或被停用；这属于身份失效，不是 404
                .orElseThrow(() -> com.shop.platform.common.BusinessException.unauthorized("账号不存在或已停用"));
        return new Me(state.buyerId(), state.nickname());
    }

    public record Me(UUID buyerId, String nickname) {}
}
