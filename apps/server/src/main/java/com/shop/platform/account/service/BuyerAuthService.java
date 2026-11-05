package com.shop.platform.account.service;

import com.shop.platform.account.AccountProperties;
import com.shop.platform.account.internal.CaptchaService;
import com.shop.platform.account.mapper.BuyerMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PasswordPolicy;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.AccessTokenIssuer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.DummyPasswordHash;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.UserAgentParser;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 买家凭证：注册、密码登录、短信登录、设密/改密、找回密码、资料。
 *
 * <p>几件刻意的事：
 *
 * <ul>
 *   <li><b>登录失败不区分「没这个号」和「密码不对」</b>，同一句话同一状态码。这个接口是匿名的，
 *       区分两者等于送一个手机号枚举器。注册接口那边必须区分（用户要知道换个号）——两个接口取舍不同。
 *   <li><b>查用户与比密码之间不做分支</b>，用户不存在也对占位哈希跑满一次 BCrypt
 *       （{@link DummyPasswordHash}），堵按响应耗时做账号枚举；被限流同样跑满。
 *   <li><b>注册撞号靠唯一索引兜底</b>，不先查后插。查和插之间的窗口就是两个请求同时注册同一个号。
 *   <li><b>密码只存 BCrypt</b>，强度口径全后端只有 {@link PasswordPolicy} 一份。
 * </ul>
 */
@Component
public class BuyerAuthService {

    private static final Logger log = LoggerFactory.getLogger(BuyerAuthService.class);

    private static final String WRONG_CREDENTIALS = "手机号或密码不正确";

    // 限流：IP 10 次/60 秒、账号 5 次/600 秒。与员工/卖家登录同档——三条匿名登录入口对爆破的容忍度不该不同。
    // 被限流的响应与凭证失败同话术同状态码：告诉攻击者「已被盯上」等于教它降速换 IP。
    private static final String RATE_IP_PWD = "rl:ip:buyer-pwd:";
    private static final String RATE_USER_PWD = "rl:buyer:pwd:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW_SECONDS = 60;
    private static final int RATE_USER_MAX = 5;
    private static final int RATE_USER_WINDOW_SECONDS = 600;

    private final BuyerMapper buyers;
    private final PasswordEncoder passwordEncoder;
    private final AccessTokenIssuer tokenIssuer;
    private final RefreshTokenStore refreshTokenStore;
    private final SmsCodeService smsCodeService;
    private final CaptchaService captchaService;
    private final UserAgentParser userAgentParser;
    private final StringRedisTemplate redis;
    private final RateLimiter rateLimiter;
    private final AccountProperties props;

    public BuyerAuthService(
            BuyerMapper buyers,
            PasswordEncoder passwordEncoder,
            AccessTokenIssuer tokenIssuer,
            RefreshTokenStore refreshTokenStore,
            SmsCodeService smsCodeService,
            CaptchaService captchaService,
            UserAgentParser userAgentParser,
            StringRedisTemplate redis,
            RateLimiter rateLimiter,
            AccountProperties props) {
        this.buyers = Objects.requireNonNull(buyers, "buyers");
        this.passwordEncoder = Objects.requireNonNull(passwordEncoder, "passwordEncoder");
        this.tokenIssuer = Objects.requireNonNull(tokenIssuer, "tokenIssuer");
        this.refreshTokenStore = Objects.requireNonNull(refreshTokenStore, "refreshTokenStore");
        this.smsCodeService = Objects.requireNonNull(smsCodeService, "smsCodeService");
        this.captchaService = Objects.requireNonNull(captchaService, "captchaService");
        this.userAgentParser = Objects.requireNonNull(userAgentParser, "userAgentParser");
        this.redis = Objects.requireNonNull(redis, "redis");
        this.rateLimiter = Objects.requireNonNull(rateLimiter, "rateLimiter");
        this.props = Objects.requireNonNull(props, "props");
    }

    /** 密码注册。撞号必须区分：用户要知道换号还是去登录。 */
    public Session register(
            String phone, String rawPassword, String displayName, String deviceId, String clientIp, String userAgent) {
        PasswordPolicy.require(rawPassword, phone);
        UUID buyerId = Ids.newId();
        try {
            buyers.insert(buyerId, phone, passwordEncoder.encode(rawPassword), displayName);
        } catch (DuplicateKeyException e) {
            throw BusinessException.conflict(ErrorCodes.PHONE_ALREADY_REGISTERED, "这个手机号已经注册过了");
        }
        log.info("[BUYER] 注册成功, buyerId={}", buyerId);
        return issueSession(buyerId, deviceId, clientIp, userAgent);
    }

    public Session loginByPassword(
            String phone, String rawPassword, String deviceId, String clientIp, String userAgent) {
        // 1. 限流检查（被限流时走占位哈希保持时序一致）
        rejectIfRateLimited(phone, rawPassword, clientIp);

        // 2. 验证凭证：查用户与比密码之间不做分支
        BuyerMapper.Credentials found = buyers.findActiveByPhone(phone).orElse(null);
        String storedHash =
                found != null && found.passwordHash() != null ? found.passwordHash() : DummyPasswordHash.HASH;
        boolean matched = passwordEncoder.matches(rawPassword, storedHash);
        if (found == null || !matched) {
            // 「未设密码」也并进同一句话：短信注册的活跃号很多，在登录路径暴露该状态等于帮攻击者筛出真实注册户
            log.warn(
                    "[BUYER] 密码登录失败, phone={}, reason={}",
                    PhoneNumber.mask(phone),
                    found == null ? "not_found" : "wrong_or_unset");
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }

        // 3. 登录成功清除失败计数（成功即归零，不让历史失败拖累下一次）
        redis.delete(RATE_IP_PWD + clientIp);
        redis.delete(RATE_USER_PWD + phone);

        return issueSession(found.buyerId(), deviceId, clientIp, userAgent);
    }

    /**
     * 短信验证码登录：有号就登，没号自动注册（并发撞唯一索引后回读对方插入的账号即幂等）。
     * 不加事务：单行 insert 与 lastLoginAt 更新，无多表一致性诉求；且 PG 一报唯一错就把事务标 aborted，
     * catch 后回读走不到。
     */
    public Session loginBySms(String phone, String code, String deviceId, String clientIp, String userAgent) {
        smsCodeService.verifyCode(phone, code);

        BuyerMapper.PhoneRow user = buyers.findByPhone(phone).orElse(null);
        if (user == null) {
            UUID buyerId = Ids.newId();
            try {
                buyers.insert(buyerId, phone, null, defaultNickname(phone));
            } catch (DuplicateKeyException e) {
                // 并发首登：回读对方插入的账号，登录照常
                user = buyers.findByPhone(phone).orElseThrow(() -> e);
            }
        }
        if (user == null) {
            throw new IllegalStateException("unreachable");
        }

        // 禁用账号不得借短信通道绕过
        if (!user.active()) {
            throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被禁用");
        }
        // 休眠闸门（号码回收防接管）：设有密码且长期未活跃的账号不再吃短信通道。
        // 号码被电信回收再放号后，新机主能收到验证码；有密码的账号退回密码通道，
        // 短信找回密码同样被闸（见 resetPassword）。没密码的账号没有可保护的东西，短信照常。
        if (isDormantWithPassword(user.passwordHash(), user.lastLoginAt())) {
            log.warn("[BUYER] 休眠账号拒绝短信登录, buyerId={}", user.buyerId());
            throw BusinessException.forbidden("账号长期未活跃，为保护账号安全，请使用密码登录");
        }

        return issueSession(user.buyerId(), deviceId, clientIp, userAgent);
    }

    /** 发送登录短信验证码。图形验证码先消费再发码：廉价凭证先失败，才轮到按条计费的短信。 */
    public void sendSmsCode(String phone, String captchaId, String captchaCode, String clientIp) {
        captchaService.verify(captchaId, captchaCode);
        smsCodeService.sendCode(phone, clientIp);
    }

    // 设置/修改密码
    /**
     * 首次设置密码（无旧密码校验）或修改密码（需当前密码）。改密后吊销全部设备的会话：
     * 口令被更换 + 全端下线，是账号接管处置的同一后果，不分「自己改」还是「被重置」。
     */
    public void setPassword(UUID buyerId, String currentPassword, String newPassword) {
        String passwordHash = buyers.findPasswordHash(buyerId).orElseThrow(() -> BusinessException.notFound("用户不存在"));
        PasswordPolicy.require(newPassword, null);

        // 已有密码时必须验证当前密码：改密是凭证变更，不是资料编辑
        if (passwordHash != null) {
            if (currentPassword == null || !passwordEncoder.matches(currentPassword, passwordHash)) {
                throw BusinessException.unauthorized("当前密码错误");
            }
        }

        buyers.updatePasswordHash(buyerId, passwordEncoder.encode(newPassword));
        refreshTokenStore.revokeAll(buyerId.toString());
        log.info("[BUYER] 密码变更, buyerId={}", buyerId);
    }

    // 找回密码
    /**
     * 发送重置密码验证码。与登录发码同一个人机验证前置：本端点同样是匿名、按自报手机号发真短信的入口，
     * 只靠 IP/号码频控挡不住横扫。账号不存在也照常发——对外不暴露账号存在性，频控兜住滥用。
     */
    public void forgotPassword(String phone, String captchaId, String captchaCode, String clientIp) {
        captchaService.verify(captchaId, captchaCode);
        smsCodeService.sendResetCode(phone, clientIp);
        log.info("[BUYER] 重置密码验证码已发送, phone={}", PhoneNumber.mask(phone));
    }

    /**
     * 使用重置验证码设置新密码（单次消费 + 尝试上限在 SmsCodeService）。
     * 用户不存在也静默成功，不暴露账号存在性；休眠且有密码的账号同样静默跳过
     * ——号码已易主时，「能收到验证码」不构成重置旧账号凭证的资格。
     */
    public void resetPassword(String phone, String code, String newPassword) {
        // 先本地校验，避免浪费一次性验证码
        PasswordPolicy.require(newPassword, phone);
        smsCodeService.verifyResetCode(phone, code);

        BuyerMapper.PhoneRow user = buyers.findByPhone(phone).orElse(null);
        if (user == null) {
            return;
        }
        if (isDormantWithPassword(user.passwordHash(), user.lastLoginAt())) {
            log.warn("[BUYER] 休眠账号拒绝短信重置密码, buyerId={}", user.buyerId());
            return;
        }
        buyers.updatePasswordHash(user.buyerId(), passwordEncoder.encode(newPassword));
        refreshTokenStore.revokeAll(user.buyerId().toString());
        log.info("[BUYER] 密码已重置, buyerId={}", user.buyerId());
    }

    // 资料
    /**
     * 改昵称。昵称不是凭证：不需要旧密码，改完即生效。
     *
     * <p>非空与长度上限由 {@code UpdateProfileRequest} 的 {@code @NotBlank @Size(max = 32)} 走
     * 422 字段级错误，这里只做落库前的 trim——别再造一份 400 口径的等价校验。
     */
    public String updateDisplayName(UUID buyerId, String displayName) {
        var unused = buyers.find(buyerId).orElseThrow(() -> BusinessException.notFound("用户不存在"));
        String trimmed = displayName == null ? "" : displayName.trim();
        buyers.updateDisplayName(buyerId, trimmed);
        return trimmed;
    }

    // 会话签发
    /**
     * 签发 access + refresh，落设备索引与最近登录时刻。注册与两条登录路径共用。
     * 不打「登录成功」审计事件：rewrite 的可观测出口还没立事件词表，先留结构化日志。
     */
    public Session issueSession(UUID buyerId, String deviceId, String clientIp, String userAgent) {
        String accessToken = tokenIssuer.issue(buyerId, CurrentOperator.TYPE_BUYER);
        String refreshToken = RefreshTokenStore.newToken();
        DeviceInfo deviceInfo = new DeviceInfo(userAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(buyerId.toString(), deviceId, refreshToken, deviceInfo);
        buyers.touchLastLogin(buyerId, OffsetDateTime.now());
        return new Session(accessToken, refreshToken, tokenIssuer.expiresInSeconds());
    }

    /** 休眠判定：设有密码且（从未登录 或 最近一次活跃早于窗口） */
    private boolean isDormantWithPassword(String passwordHash, OffsetDateTime lastLoginAt) {
        if (passwordHash == null || props.dormantLoginDays() <= 0) {
            return false;
        }
        OffsetDateTime threshold = OffsetDateTime.now().minusDays(props.dormantLoginDays());
        return lastLoginAt == null || lastLoginAt.isBefore(threshold);
    }

    private void rejectIfRateLimited(String phone, String password, String clientIp) {
        boolean ipLimited =
                rateLimiter.exceeded(RATE_IP_PWD + clientIp, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW_SECONDS));
        boolean userLimited = rateLimiter.exceeded(
                RATE_USER_PWD + phone, RATE_USER_MAX, Duration.ofSeconds(RATE_USER_WINDOW_SECONDS));
        if (ipLimited || userLimited) {
            // 命中限流 = 爆破正在进行；对外文案仍与凭证失败同一句
            log.warn("[BUYER] 密码登录被限流, phone={}, client_ip={}", PhoneNumber.mask(phone), clientIp);
            passwordEncoder.matches(password, DummyPasswordHash.HASH);
            throw BusinessException.unauthorized(WRONG_CREDENTIALS);
        }
    }

    private static String defaultNickname(String phone) {
        return "用户" + phone.substring(phone.length() - 4);
    }

    /** 登录/刷新的统一出参：access 立即用；refresh 由 controller 落进 httpOnly cookie，同时在体里带给无 cookie 容器的原生端。 */
    public record Session(String accessToken, String refreshToken, long expiresIn) {}
}
