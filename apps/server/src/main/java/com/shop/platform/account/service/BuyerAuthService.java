package com.shop.platform.account.service;

import com.shop.platform.account.mapper.BuyerStore;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.infra.security.CurrentOperator;
import java.util.Objects;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 买家注册与登录。
 *
 * <p>三件刻意的事：
 *
 * <ul>
 *   <li><b>登录失败不区分"没这个号"和"密码不对"</b>。这个接口是匿名的，区分两者等于送一个手机号枚举器。
 *       注册接口那边必须区分（用户要知道换个号），所以撞号有专门的码——两个接口的取舍不一样。
 *   <li><b>注册撞号靠唯一索引兜底</b>，不先查后插。查和插之间的窗口就是两个请求同时注册同一个号。
 *   <li><b>密码只存 BCrypt</b>，用 Spring Security 的编码器，不自己搓盐。
 * </ul>
 */
@Component
public class BuyerAuthService {

    private static final String WRONG_CREDENTIALS = "手机号或密码不正确";

    private final BuyerStore buyers;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenIssuer tokenIssuer;

    public BuyerAuthService(BuyerStore buyers, PasswordEncoder passwordEncoder, AccessTokenIssuer tokenIssuer) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
    }

    @Transactional
    public LoginResult register(String phone, String rawPassword, String nickname) {
        UUID buyerId = Ids.newId();
        try {
            buyers.insert(buyerId, phone, passwordEncoder.encode(rawPassword), nickname);
        } catch (DuplicateKeyException e) {
            // 撞 uq_buyer_phone。这里必须区分，用户要知道换一个号
            throw BusinessException.conflict(ErrorCodes.PHONE_ALREADY_REGISTERED, "这个手机号已经注册过了");
        }
        return new LoginResult(tokenIssuer.issue(buyerId, CurrentOperator.TYPE_BUYER), tokenIssuer.expiresInSeconds());
    }

    public LoginResult login(String phone, String rawPassword) {
        BuyerStore.Credentials found =
                buyers.findActiveByPhone(phone).orElseThrow(() -> BusinessException.unauthorized(WRONG_CREDENTIALS));

        if (!passwordEncoder.matches(rawPassword, found.passwordHash())) {
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        return new LoginResult(
                tokenIssuer.issue(found.buyerId(), CurrentOperator.TYPE_BUYER), tokenIssuer.expiresInSeconds());
    }

    public record LoginResult(String accessToken, long expiresIn) {}
}
