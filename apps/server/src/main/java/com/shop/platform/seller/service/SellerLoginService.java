package com.shop.platform.seller.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.seller.mapper.OperatorCredentialStore;
import java.util.Objects;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 卖家登录。密码校验用 Spring Security 的 {@link PasswordEncoder}，令牌签发交给
 * {@link AccessTokenIssuer}，这里只做两件判断。
 *
 * <p>登录名不存在和密码不对返回<b>同一句话、同一个状态码</b>：这个接口是匿名的，区分两者等于送一个账号枚举器。
 *
 * <p>失败时抛 401 而不是 400——认证失败就是认证失败，前端靠状态码分流。
 */
@Component
public class SellerLoginService {

    private static final String WRONG_CREDENTIALS = "登录名或密码不正确";

    private final OperatorCredentialStore credentials;

    private final PasswordEncoder passwordEncoder;

    private final AccessTokenIssuer tokenIssuer;

    public SellerLoginService(
            OperatorCredentialStore credentials, PasswordEncoder passwordEncoder, AccessTokenIssuer tokenIssuer) {
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
    }

    public LoginResult login(String loginName, String rawPassword) {
        OperatorCredentialStore.Credentials found =
                credentials.findActive(loginName).orElseThrow(() -> BusinessException.unauthorized(WRONG_CREDENTIALS));

        if (!passwordEncoder.matches(rawPassword, found.passwordHash())) {
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        String accessToken = tokenIssuer.issue(found.operatorId(), found.merchantId());
        return new LoginResult(accessToken, tokenIssuer.expiresInSeconds());
    }

    public record LoginResult(String accessToken, long expiresIn) {}
}
