package com.shop.platform.account.service;

import com.shop.platform.account.infra.RateLimiter;
import com.shop.platform.account.infra.UserAgentParser;
import com.shop.platform.account.mapper.User;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Text;
import com.shop.platform.infra.observability.MdcScope;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class AuthService {

    // Rate limiting (LOGIN-05)
    private static final String RATE_IP_PWD = "rl:ip:pwd:";
    private static final String RATE_USER_PWD = "rl:user:pwd:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW = 60; // 秒
    private static final int RATE_USER_MAX = 5;
    private static final int RATE_USER_WINDOW = 600; // 秒

    // Password reset（验证码签发/校验收敛在 SmsCodeService，这里只做业务编排）

    // Common password blacklist (REG-03)
    private static final Set<String> COMMON_PASSWORDS = Set.of(
            "123456",
            "12345678",
            "123456789",
            "password",
            "qwerty123",
            "111111",
            "000000",
            "admin123",
            "abc123",
            "password1",
            "1234567890",
            "qwertyuiop",
            "asdfghjkl",
            "zxcvbnm");

    /**
     * 等时对比用的占位哈希（LOGIN-01）：用户不存在/被限流时拿它跑一次 BCrypt，让响应耗时与"用户存在且密码错误"
     * 一致，堵掉按响应时间做账号枚举。
     *
     * <p>必须是<b>合法</b> BCrypt 串且代价与 {@code passwordEncoder} 相同：Spring 的 BCryptPasswordEncoder
     * 先用正则 {@code \$2[ayb]\$\d{2}\$[./0-9A-Za-z]{53}} 校验格式，不合法就打条 WARN 直接 return false
     * ——KDF 根本不执行，等时防护形同虚设（曾因手写 46 位零串踩过：占位 139µs vs 真实 179ms，差 1289 倍）。
     * 故这里由编码器现算而非硬编码字面量，代价因子跟着 {@link PasswordEncoderConfig#BCRYPT_STRENGTH} 走，不会失配。
     * 格式不变式由 AuthServiceTest 钉死。
     */
    static final String DUMMY_PASSWORD_HASH = new BCryptPasswordEncoder(PasswordEncoderConfig.BCRYPT_STRENGTH)
            .encode("dummy-placeholder-never-matches-any-real-password");

    private final UserMapper userMapper;
    private final JwtProvider jwtProvider;
    private final PasswordEncoder passwordEncoder;
    private final SmsCodeService smsCodeService;
    private final StringRedisTemplate redis;
    private final RefreshTokenStore refreshTokenStore;

    // ========== 短信登录/注册 ==========

    /**
     * 不加事务：并发首登时 insert 撞唯一索引后 PG 会中止当前事务，catch 后无法回读；
     * 且本方法只有单行 insert 与 lastLoginAt 更新，无多表一致性诉求。
     */
    public TokenPair loginBySms(String phone, String code, String deviceId, String clientIp, String userAgent) {
        // 1. 校验短信验证码
        smsCodeService.verifyCode(phone, code);

        // 2. 查找或自动注册；并发撞 idx_users_phone 时回读对方插入的账号即可幂等
        User user = userMapper.selectByPhone(phone);
        if (user == null) {
            user = User.autoRegister(phone);
            try {
                userMapper.insert(user);
            } catch (DuplicateKeyException e) {
                user = userMapper.selectByPhone(phone);
                if (user == null) throw e;
            }
        }

        // 3. 账号状态检查：与密码登录同门槛，禁用账号不得借短信通道绕过
        ensureUserActive(user);

        // 4. 签发 Token
        return issueTokens(user, deviceId, clientIp, userAgent);
    }

    // ========== 密码登录 ==========

    public TokenPair loginByPassword(
            String phone, String password, String deviceId, String clientIp, String userAgent) {

        // 1. 限流检查（被限流时走 dummy hash 防时序探测）
        rejectIfRateLimited(phone, password, clientIp);

        // 2. 验证凭证
        User user = authenticate(phone, password, clientIp);

        // 3. 检查账号状态
        ensureUserActive(user);

        // 4. 登录成功清除失败计数（LOGIN-08）
        clearPasswordRateLimit(phone, clientIp);

        // 5. 签发 Token
        return issueTokens(user, deviceId, clientIp, userAgent);
    }

    // ========== 设置/修改密码 ==========

    /** 首次设置密码（无旧密码校验）或修改密码（需当前密码） */
    public void setPassword(UUID userId, String currentPassword, String newPassword) {
        // 1. 检查用户存在
        User user = userMapper.selectById(userId);
        if (user == null) throw BusinessException.notFound("用户不存在");

        // 2. 校验新密码强度
        validatePassword(newPassword, user.getPhone());

        // 3. 已有密码时必须验证当前密码（RESET-05）
        if (user.getPasswordHash() != null) {
            if (currentPassword == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
                throw BusinessException.unauthorized("当前密码错误");
            }
        }

        // 4. 更新密码
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userMapper.updateById(user);

        // 5. 改密后吊销该用户所有 device 的 refresh token（REVOKE-02）
        deleteAllRefreshTokens(userId);

        log.info("[AUTH] 密码修改成功, userId={}", userId);
    }

    // ========== 密码重置 ==========

    /** 发送重置密码验证码（RESET-01/02）。频控与 OTP 生命周期收敛在 SmsCodeService */
    public void forgotPassword(String phone, String clientIp) {
        smsCodeService.sendResetCode(phone, clientIp);
        log.info("[AUTH] 重置密码验证码已发送, phone={}", PhoneNumber.mask(phone));
    }

    /** 使用重置验证码设置新密码（RESET-02/03） */
    @Transactional
    public void resetPassword(String phone, String code, String newPassword) {
        // 1. 校验新密码强度（先本地校验，避免浪费一次性验证码）
        validatePassword(newPassword, phone);

        // 2. 校验重置验证码（单次消费 + 尝试上限，防线同登录验证码）
        smsCodeService.verifyResetCode(phone, code);

        // 3. 更新密码（用户不存在也静默成功，不暴露账号存在性）
        User user = userMapper.selectByPhone(phone);
        if (user != null) {
            user.setPasswordHash(passwordEncoder.encode(newPassword));
            userMapper.updateById(user);

            // RESET-03: 重置后吊销该用户所有 session
            deleteAllRefreshTokens(user.getId());
        }
    }

    // ========== Token 刷新（Rotation） ==========

    /** 刷新双 token（MAINT-03: 一次一换；MAINT-04: 重放检测）。Redis 机制见 RefreshTokenStore */
    public TokenPair refresh(String refreshToken, String deviceId, String clientIp, String userAgent) {
        // 1~4. 消费旧码 + 重放裁决 + 标记消费 + 清旧设备索引（机制收敛在 RefreshTokenStore.rotate）
        String storedUserId = refreshTokenStore.rotate(refreshToken, deviceId, "[AUTH]");

        // 5. 查用户并签发全新 Token；禁用账号在此拦截——旧码已消费、新码不签发，封号即等于吊销全部会话
        User user = userMapper.selectById(UUID.fromString(storedUserId));
        if (user == null) throw BusinessException.notFound("用户不存在");
        ensureUserActive(user);
        return issueTokens(user, deviceId, clientIp, userAgent);
    }

    // ========== 当前用户 ==========

    /** 获取当前登录用户实体；手机号脱敏等展示变形由 controller 组装 MeResponse 时完成 */
    public User getMe(UUID userId) {
        User user = userMapper.selectById(userId);
        if (user == null) throw BusinessException.notFound("用户不存在");
        return user;
    }

    /** 更新个人资料：昵称 + 头像（头像 key 由前端上传后随请求带回）。avatarKey null＝不改，空串＝清空 */
    public User updateProfile(UUID userId, String nickname, String avatarKey) {
        User user = userMapper.selectById(userId);
        if (user == null) throw BusinessException.notFound("用户不存在");
        if (nickname != null) {
            String trimmed = nickname.trim();
            if (trimmed.isEmpty()) throw BusinessException.badRequest("昵称不能为空");
            if (trimmed.length() > 30) throw BusinessException.badRequest("昵称不能超过 30 字");
            user.setNickname(trimmed);
        }
        if (avatarKey != null) {
            user.setAvatarKey(Text.blankToNull(avatarKey));
        }
        userMapper.updateById(user);
        return user;
    }

    // ========== 设备管理 ==========

    /** 枚举当前有效的登录设备（含元数据），供安全设置页展示 */
    public List<RefreshTokenStore.DeviceEntry> listDevices(UUID userId, String currentDeviceId) {
        return refreshTokenStore.listDevices(userId.toString(), currentDeviceId);
    }

    /** 登出单个设备 */
    public void deleteDevice(UUID userId, String deviceId) {
        refreshTokenStore.revokeDevice(userId.toString(), deviceId);
    }

    /** 登出所有设备（清空当前用户全端会话） */
    public void logoutAll(UUID userId) {
        refreshTokenStore.revokeAll(userId.toString());
    }

    // ========== 登出 ==========

    /** 登出：删除当前设备 refresh token */
    public void logout(UUID userId, String deviceId) {
        refreshTokenStore.revokeDevice(userId.toString(), deviceId);
    }

    // ========== 限流 ==========

    /** 双维度限流（IP + 账号），被限流时走 dummy hash 保持时序一致（LOGIN-05, LOGIN-01） */
    private void rejectIfRateLimited(String phone, String password, String ip) {
        boolean ipLimited =
                RateLimiter.exceeded(redis, RATE_IP_PWD + ip, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW));
        boolean userLimited =
                RateLimiter.exceeded(redis, RATE_USER_PWD + phone, RATE_USER_MAX, Duration.ofSeconds(RATE_USER_WINDOW));

        if (ipLimited || userLimited) {
            // 限流时仍执行 BCrypt 对比，防止通过返回时长探测账号是否存在（LOGIN-01）
            passwordEncoder.matches(password, DUMMY_PASSWORD_HASH);
            throw BusinessException.unauthorized("手机号或密码错误");
        }
    }

    private void clearPasswordRateLimit(String phone, String ip) {
        redis.delete(RATE_IP_PWD + ip);
        redis.delete(RATE_USER_PWD + phone);
    }

    // ========== 凭证验证 ==========

    /** 查询用户并比对密码（查用户与比密码之间不做分支，走到底） */
    private User authenticate(String phone, String password, String clientIp) {
        // LOGIN-01/02: 查用户与比密码之间不做分支，走到底
        User user = userMapper.selectByPhone(phone);
        String storedHash =
                user != null && user.getPasswordHash() != null ? user.getPasswordHash() : DUMMY_PASSWORD_HASH;

        boolean matched = passwordEncoder.matches(password, storedHash);

        if (user == null || !matched) {
            // LOGIN-01: 对外统一——不管「无此用户 / 未设密码 / 密码错误」，响应体一律相同，防账号枚举。
            // no_password 分支刻意不返回 PASSWORD_NOT_SET：短信自动注册会产生大量「从未设密码」的活跃号，
            // 若在登录路径暴露该状态，攻击者即可筛出真实注册户（枚举）。真正需要引导用户去设密的场景
            // 放注册后环节，不走登录失败通道；此处只保留内部精确日志（UX-05），供运营揪撞库者。
            throw loginRejected(user, phone, clientIp);
        }
        return user;
    }

    /** 登录失败的统一出口：内部分支记精确原因（供运营排查），对外一律同一句话；MDC 供日志检索聚合 */
    private BusinessException loginRejected(User user, String phone, String clientIp) {
        String reason;
        if (user == null) {
            reason = "user_not_found";
            log.warn("[AUTH] 登录失败：用户不存在, phone={}, ip={}", PhoneNumber.mask(phone), clientIp);
        } else if (user.getPasswordHash() == null) {
            reason = "no_password";
            log.warn("[AUTH] 登录失败：未设置密码, userId={}, ip={}", user.getId(), clientIp);
        } else {
            reason = "wrong_password";
            log.warn("[AUTH] 登录失败：密码错误, userId={}, ip={}", user.getId(), clientIp);
        }
        try (MdcScope scope = MdcScope.of("event", "auth.login.failed", "reason", reason, "client_ip", clientIp)) {
            scope.put("user_id", user == null ? null : user.getId().toString());
            log.warn("[AUTH] 登录失败, reason={}, client_ip={}", reason, clientIp);
        }
        return BusinessException.unauthorized("手机号或密码错误");
    }

    private void ensureUserActive(User user) {
        if (!user.isActive()) {
            throw new BusinessException(403, "USER_DISABLED", "账号已被禁用");
        }
    }

    // ========== Token 签发 ==========

    private TokenPair issueTokens(User user, String deviceId, String clientIp, String userAgent) {
        String accessToken = jwtProvider.createAccessToken(user.getId());
        String refreshToken = jwtProvider.generateRefreshToken();

        // MAINT-01/02: 只存 HMAC 摘要不落明文；随签发记录设备元数据（设备名/IP/时间），供设备列表展示
        DeviceInfo deviceInfo = new DeviceInfo(UserAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(user.getId().toString(), deviceId, refreshToken, deviceInfo);

        // 更新最后登录时间
        user.setLastLoginAt(OffsetDateTime.now());
        userMapper.updateById(user);

        // EVT-12: 登录成功事件
        try (MdcScope _ = MdcScope.of(
                "event", "auth.login.succeeded", "user_id", user.getId().toString())) {
            log.info("[AUTH] 登录成功, userId={}", user.getId());
        }

        return new TokenPair(accessToken, refreshToken);
    }

    // ========== Token 吊销 ==========

    /** 清除用户所有设备的 refresh token */
    public void deleteAllRefreshTokens(UUID userId) {
        refreshTokenStore.revokeAll(userId.toString());
    }

    // ========== 密码校验 ==========

    private void validatePassword(String password, String phone) {
        // REG-01: 最小长度 8 位
        if (password == null || password.length() < 8) {
            throw BusinessException.badRequest("密码长度至少 8 位");
        }
        // REG-06: BCrypt 的 72 是「字节」上限，不是字符数（多字节字符会超 72 字节导致编码失败/截断失配）
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw BusinessException.badRequest("密码长度不能超过 72 位");
        }
        // REG-05: 不与手机号相同
        if (password.equals(phone)) {
            throw BusinessException.badRequest("密码不能与手机号相同");
        }
        // REG-03: 常见密码黑名单
        if (COMMON_PASSWORDS.contains(password.toLowerCase(Locale.ROOT))) {
            throw BusinessException.badRequest("密码过于常见，请更换");
        }
    }

    // ========== 工具方法 ==========
}
