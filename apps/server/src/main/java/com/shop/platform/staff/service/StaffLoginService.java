package com.shop.platform.staff.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.staff.mapper.StaffStore;
import java.util.Objects;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 平台员工登录。
 *
 * <p>与卖家登录同一套纪律：登录名不存在和密码不对返回同一句话、同一个状态码（401）。
 * 这个接口是匿名的，区分两者等于送一个账号枚举器——平台员工的账号枚举比卖家的更敏感，
 * 因为它直接暴露"谁在管这个平台"。
 */
@Component
public class StaffLoginService {

    private static final String WRONG_CREDENTIALS = "账号或密码不正确";

    private final StaffStore store;

    private final PasswordEncoder passwordEncoder;

    private final AccessTokenIssuer tokenIssuer;

    public StaffLoginService(StaffStore store, PasswordEncoder passwordEncoder, AccessTokenIssuer tokenIssuer) {
        this.store = Objects.requireNonNull(store, "store");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
    }

    public LoginResult login(String loginName, String rawPassword) {
        StaffStore.StaffRow found =
                store.findByLogin(loginName).orElseThrow(() -> BusinessException.unauthorized(WRONG_CREDENTIALS));

        if (!"active".equals(found.status())) {
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        if (!passwordEncoder.matches(rawPassword, found.passwordHash())) {
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        String accessToken = tokenIssuer.issue(found.id(), CurrentOperator.TYPE_STAFF);
        return new LoginResult(accessToken, tokenIssuer.expiresInSeconds());
    }

    public record LoginResult(String accessToken, long expiresIn) {}
}
