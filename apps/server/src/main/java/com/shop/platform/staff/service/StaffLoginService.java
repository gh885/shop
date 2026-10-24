package com.shop.platform.staff.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.DummyPasswordHash;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.UserAgentParser;
import com.shop.platform.staff.mapper.StaffMapper;
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
 * 平台员工认证：登录名 + 密码登录，token 与 C 端隔离（typ=staff）。
 *
 * <p>限流与等时对比两道防护与买家侧密码登录同一套口径：本端点匿名可达，打的又是权限最高的账号库，
 * 缺任一道它就是爆破性价比最高的入口——缺限流可按线速试口令，缺等时对比则「工号存在」与
 * 「不存在」的响应耗时差一次 BCrypt，等于白送一个枚举口。
 *
 * <p>登录名不存在和密码不对返回<b>同一句话、同一个状态码</b>（401），精确原因只进日志。
 */
@Component
public class StaffLoginService {

    private static final Logger log = LoggerFactory.getLogger(StaffLoginService.class);

    private static final String WRONG_CREDENTIALS = "账号或密码不正确";

    private static final String RATE_IP_PWD = "rl:ip:staff-pwd:";
    private static final String RATE_STAFF_PWD = "rl:staff:pwd:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW_SECONDS = 60;
    private static final int RATE_STAFF_MAX = 5;
    private static final int RATE_STAFF_WINDOW_SECONDS = 600;

    private final StaffMapper store;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenIssuer tokenIssuer;
    private final RefreshTokenStore refreshTokenStore;
    private final UserAgentParser userAgentParser;
    private final StringRedisTemplate redis;

    public StaffLoginService(
            StaffMapper store,
            PasswordEncoder passwordEncoder,
            AccessTokenIssuer tokenIssuer,
            RefreshTokenStore refreshTokenStore,
            UserAgentParser userAgentParser,
            StringRedisTemplate redis) {
        this.store = Objects.requireNonNull(store, "store");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.userAgentParser = Objects.requireNonNull(userAgentParser, "userAgentParser");
        this.redis = Objects.requireNonNull(redis, "redis");
    }

    public LoginResult login(String loginName, String rawPassword, String clientIp, String userAgent) {
        // 1. 限流检查（被限流时走占位哈希保持时序一致）
        rejectIfRateLimited(loginName, rawPassword, clientIp);

        // 2. 验证凭证：查员工与比密码之间不做分支，工号不存在也用占位哈希跑满 KDF
        StaffMapper.StaffRow staff = store.findByLogin(loginName).orElse(null);
        String storedHash = staff != null ? staff.passwordHash() : DummyPasswordHash.HASH;
        boolean matched = passwordEncoder.matches(rawPassword, storedHash);
        if (staff == null || !matched) {
            log.warn(
                    "[STAFF] 登录失败, loginName={}, client_ip={}, reason={}",
                    maskLoginName(loginName),
                    clientIp,
                    staff == null ? "not_found" : "wrong_password");
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        // 3. 状态检查：被禁员工还在试口令，本身就是最该留下记录的一次失败登录
        if (!staff.active()) {
            log.warn("[STAFF] 被禁用员工尝试登录, staffId={}, client_ip={}", staff.id(), clientIp);
            throw BusinessException.forbidden(ErrorCodes.STAFF_DISABLED, "账号已被禁用");
        }

        // 4. 登录成功清除失败计数，签发会话
        redis.delete(RATE_IP_PWD + clientIp);
        redis.delete(RATE_STAFF_PWD + loginName);
        return issue(staff.id(), null, clientIp, userAgent);
    }

    /** 刷新双 token（轮换 + 重放裁决在 RefreshTokenStore）；禁用员工在此拦截——旧码已消费、新码不签发。 */
    public LoginResult refresh(String refreshToken, String deviceId, String clientIp, String userAgent) {
        RefreshTokenStore.Rotation rotated = refreshTokenStore.rotate(refreshToken, deviceId, "[STAFF]");
        UUID staffId = UUID.fromString(rotated.subjectId());
        StaffMapper.StaffRow staff =
                store.findById(staffId).orElseThrow(() -> BusinessException.unauthorized("登录状态已失效"));
        if (!staff.active()) {
            throw BusinessException.forbidden(ErrorCodes.STAFF_DISABLED, "账号已被禁用");
        }
        return issue(staffId, rotated.deviceId(), clientIp, userAgent);
    }

    /** 登出当前设备 */
    public void logout(UUID staffId, String deviceId) {
        refreshTokenStore.revokeDevice(staffId.toString(), deviceId);
    }

    private LoginResult issue(UUID staffId, String deviceId, String clientIp, String userAgent) {
        String accessToken = tokenIssuer.issue(staffId, CurrentOperator.TYPE_STAFF);
        String refreshToken = RefreshTokenStore.newToken();
        DeviceInfo deviceInfo = new DeviceInfo(userAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(staffId.toString(), deviceId, refreshToken, deviceInfo);
        log.info("[STAFF] 会话签发, staffId={}", staffId);
        return new LoginResult(accessToken, refreshToken, tokenIssuer.expiresInSeconds());
    }

    private void rejectIfRateLimited(String loginName, String password, String clientIp) {
        boolean ipLimited = RateLimiter.exceeded(
                redis, RATE_IP_PWD + clientIp, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW_SECONDS));
        boolean staffLimited = RateLimiter.exceeded(
                redis, RATE_STAFF_PWD + loginName, RATE_STAFF_MAX, Duration.ofSeconds(RATE_STAFF_WINDOW_SECONDS));
        if (ipLimited || staffLimited) {
            log.warn("[STAFF] 登录被限流, loginName={}, client_ip={}", maskLoginName(loginName), clientIp);
            passwordEncoder.matches(password, DummyPasswordHash.HASH);
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }
    }

    /** 登录名是半标识符，日志里不整串落 */
    private static String maskLoginName(String loginName) {
        if (loginName == null || loginName.length() < 4) {
            return "****";
        }
        return loginName.charAt(0) + "***" + loginName.substring(loginName.length() - 2);
    }

    /** 登录/刷新出参：refresh 由 controller 落进 httpOnly cookie，不出响应体。 */
    public record LoginResult(String accessToken, String refreshToken, long expiresIn) {}
}
