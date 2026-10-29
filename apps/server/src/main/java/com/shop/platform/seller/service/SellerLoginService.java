package com.shop.platform.seller.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.DummyPasswordHash;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.UserAgentParser;
import com.shop.platform.seller.mapper.OperatorCredentialMapper;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 卖家登录。密码校验用 Spring Security 的 {@link PasswordEncoder}，令牌签发交给
 * {@link AccessTokenIssuer}，这里只做判断与会话签发。
 *
 * <p>登录名不存在和密码不对返回<b>同一句话、同一个状态码</b>（401）：这个接口是匿名的，区分两者
 * 等于送一个账号枚举器。被限流也是同一句话——告诉攻击者「已被盯上」等于教它降速换 IP。
 */
@Component
public class SellerLoginService {

    private static final Logger log = LoggerFactory.getLogger(SellerLoginService.class);

    private static final String WRONG_CREDENTIALS = "登录名或密码不正确";

    private static final String RATE_IP_PWD = "rl:ip:seller-pwd:";
    private static final String RATE_SELLER_PWD = "rl:seller:pwd:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW_SECONDS = 60;
    private static final int RATE_SELLER_MAX = 5;
    private static final int RATE_SELLER_WINDOW_SECONDS = 600;

    private final OperatorCredentialMapper credentials;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenIssuer tokenIssuer;
    private final RefreshTokenStore refreshTokenStore;
    private final UserAgentParser userAgentParser;
    private final StringRedisTemplate redis;

    public SellerLoginService(
            OperatorCredentialMapper credentials,
            PasswordEncoder passwordEncoder,
            AccessTokenIssuer tokenIssuer,
            RefreshTokenStore refreshTokenStore,
            UserAgentParser userAgentParser,
            StringRedisTemplate redis) {
        this.credentials = Objects.requireNonNull(credentials, "credentials");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.userAgentParser = Objects.requireNonNull(userAgentParser, "userAgentParser");
        this.redis = Objects.requireNonNull(redis, "redis");
    }

    public LoginResult login(String loginName, String rawPassword, String clientIp, String userAgent) {
        // 1. 限流检查（被限流时走占位哈希保持时序一致）
        rejectIfRateLimited(loginName, rawPassword, clientIp);

        // 2. 验证凭证：查用户与比密码之间不做分支，查不到也用占位哈希跑满 KDF
        OperatorCredentialMapper.Credentials found =
                credentials.findActive(loginName).orElse(null);
        String storedHash = found != null ? found.passwordHash() : DummyPasswordHash.HASH;
        boolean matched = passwordEncoder.matches(rawPassword, storedHash);
        if (found == null || !matched) {
            log.warn(
                    "[SELLER] 登录失败, loginName={}, client_ip={}, reason={}",
                    maskLoginName(loginName),
                    clientIp,
                    found == null ? "not_found" : "wrong_password");
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        // 3. 登录成功清失败计数，签发会话
        redis.delete(RATE_IP_PWD + clientIp);
        redis.delete(RATE_SELLER_PWD + loginName);
        return issue(found.operatorId(), found.merchantId(), null, clientIp, userAgent);
    }

    /**
     * 刷新双 token（轮换 + 重放裁决在 RefreshTokenStore）；停用账号在此拦截——旧码已消费、新码不签发，
     * 停用即等于吊销全部会话。
     */
    public LoginResult refresh(String refreshToken, String deviceId, String clientIp, String userAgent) {
        RefreshTokenStore.Rotation rotated = refreshTokenStore.rotate(refreshToken, deviceId, "[SELLER]");
        UUID operatorId = UUID.fromString(rotated.subjectId());
        OperatorCredentialMapper.SessionRow row = credentials
                .findById(operatorId)
                .orElseThrow(() -> BusinessException.unauthorized(ErrorCodes.INVALID_TOKEN, "登录状态已失效"));
        if (!row.active()) {
            throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被停用");
        }
        return issue(operatorId, row.merchantId(), rotated.deviceId(), clientIp, userAgent);
    }

    /** 登出当前设备 */
    public void logout(UUID operatorId, String deviceId) {
        refreshTokenStore.revokeDevice(operatorId.toString(), deviceId);
    }

    private LoginResult issue(UUID operatorId, UUID merchantId, String deviceId, String clientIp, String userAgent) {
        String accessToken = tokenIssuer.issue(operatorId, CurrentOperator.TYPE_SELLER, merchantId);
        String refreshToken = RefreshTokenStore.newToken();
        DeviceInfo deviceInfo = new DeviceInfo(userAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(operatorId.toString(), deviceId, refreshToken, deviceInfo);
        return new LoginResult(accessToken, refreshToken, tokenIssuer.expiresInSeconds());
    }

    /** 注册成功后立即签发会话：省一次登录往返，与买家注册同口径。 */
    public LoginResult issueSession(UUID operatorId, UUID merchantId, String clientIp, String userAgent) {
        return issue(operatorId, merchantId, null, clientIp, userAgent);
    }

    private void rejectIfRateLimited(String loginName, String password, String clientIp) {
        boolean ipLimited = RateLimiter.exceeded(
                redis, RATE_IP_PWD + clientIp, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW_SECONDS));
        boolean sellerLimited = RateLimiter.exceeded(
                redis, RATE_SELLER_PWD + loginName, RATE_SELLER_MAX, Duration.ofSeconds(RATE_SELLER_WINDOW_SECONDS));
        if (ipLimited || sellerLimited) {
            log.warn("[SELLER] 登录被限流, loginName={}, client_ip={}", maskLoginName(loginName), clientIp);
            passwordEncoder.matches(password, DummyPasswordHash.HASH);
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }
    }

    private static String maskLoginName(String loginName) {
        if (loginName == null || loginName.length() < 4) {
            return "****";
        }
        return loginName.charAt(0) + "***" + loginName.substring(loginName.length() - 2);
    }

    /** 登录/刷新出参：refresh 由 controller 落进 httpOnly cookie，不出响应体。 */
    public record LoginResult(String accessToken, String refreshToken, long expiresIn) {}
}
