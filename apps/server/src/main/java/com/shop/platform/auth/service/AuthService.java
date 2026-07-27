package com.shop.platform.auth.service;

import static com.shop.platform.auth.service.AuthHashes.sha256Hex;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.auth.infra.JwtProvider;
import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.auth.mapper.User;
import com.shop.platform.auth.mapper.UserMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.RateLimiter;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class AuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    // Opaque refresh token storage
    private static final String KEY_REFRESH = "refresh:"; // refresh:<sha256> → userId
    private static final String KEY_USER_DEVICE =
            "refresh:user:"; // refresh:user:<userId>:<deviceId> → sha256
    private static final String KEY_CONSUMED =
            "refresh:consumed:"; // refresh:consumed:<sha256> → userId (replay detection)

    private static final long REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000L; // 7 天

    // Rate limiting (LOGIN-05)
    private static final String RATE_IP_PWD = "rl:ip:pwd:";
    private static final String RATE_USER_PWD = "rl:user:pwd:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW = 60; // 秒
    private static final int RATE_USER_MAX = 5;
    private static final int RATE_USER_WINDOW = 600; // 秒

    // Password reset
    private static final String KEY_RESET = "reset:";
    private static final String KEY_RESET_RATE = "rl:reset:";
    private static final long RESET_TTL_MINUTES = 30;

    private static final String STATUS_ACTIVE = "ACTIVE";
    private static final String RESET_TOKEN_PREFIX = "rst:";

    // Common password blacklist (REG-03)
    private static final Set<String> COMMON_PASSWORDS =
            Set.of(
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

    // Dummy hash for timing-consistent login (LOGIN-01)
    private static final String DUMMY_PASSWORD_HASH =
            "$2a$12$0000000000000000000000000000000000000000000000";

    private final UserMapper userMapper;
    private final JwtProvider jwtProvider;
    private final PasswordEncoder passwordEncoder;
    private final SmsCodeService smsCodeService;
    private final SmsChannel smsChannel;
    private final StringRedisTemplate redis;

    // ========== 短信登录/注册 ==========

    @Transactional
    public TokenResult loginBySms(String phone, String code, String deviceId, String clientIp) {
        // 1. 校验短信验证码
        smsCodeService.verifyCode(phone, code);

        // 2. 查找或自动注册（手机号不存在则创建）
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
        if (user == null) {
            user = new User();
            user.setPhone(phone);
            user.setStatus(STATUS_ACTIVE);
            userMapper.insert(user);
        }

        // 3. 签发 Token
        return issueTokens(user, deviceId);
    }

    // ========== 密码登录 ==========

    public TokenResult loginByPassword(
            String phone, String password, String deviceId, String clientIp) {

        // 1. 限流检查（被限流时走 dummy hash 防时序探测）
        rejectIfRateLimited(phone, password, clientIp);

        // 2. 验证凭证
        User user = authenticate(phone, password, clientIp);

        // 3. 检查账号状态
        ensureUserActive(user);

        // 4. 登录成功清除失败计数（LOGIN-08）
        clearPasswordRateLimit(phone, clientIp);

        // 5. 签发 Token
        return issueTokens(user, deviceId);
    }

    // ========== 设置/修改密码 ==========

    /** 首次设置密码（无旧密码校验）或修改密码（需当前密码） */
    public void setPassword(Long userId, String currentPassword, String newPassword) {
        // 1. 检查用户存在
        User user = userMapper.selectById(userId);
        if (user == null) throw BusinessException.notFound("用户不存在");

        // 2. 校验新密码强度
        validatePassword(newPassword, user.getPhone());

        // 3. 已有密码时必须验证当前密码（RESET-05）
        if (user.getPasswordHash() != null) {
            if (currentPassword == null
                    || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
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

    /** 发送重置密码验证码（RESET-01/02） */
    public void forgotPassword(String phone, String clientIp) {
        // 1. 限流检查（RESET-01: 不暴露账号存在性，静默返回）
        String rateKey = KEY_RESET_RATE + phone;
        if (Boolean.TRUE.equals(redis.hasKey(rateKey))) {
            return;
        }

        // 2. 生成重置 Token（存 SHA-256 哈希，不落明文）
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        String token = RESET_TOKEN_PREFIX + HexFormat.of().formatHex(bytes);
        String hash = sha256Hex(token);

        // 3. 存储哈希，30 分钟有效期（RESET-02）
        redis.opsForValue().set(KEY_RESET + hash, phone, Duration.ofMinutes(RESET_TTL_MINUTES));
        redis.opsForValue().set(rateKey, "1", Duration.ofSeconds(60));

        // 4. 通过短信发送
        smsChannel.sendCode(phone, "重置密码验证码: " + token);
        log.info("[AUTH] 重置密码验证码已发送, phone={}", maskPhone(phone));
    }

    /** 使用重置 token 设置新密码（RESET-02/03） */
    @Transactional
    public void resetPassword(String phone, String token, String newPassword) {
        // 1. 校验新密码强度
        validatePassword(newPassword, phone);

        // 2. 验证重置 Token（单次使用 getAndDelete）
        String hash = sha256Hex(token);
        String storedPhone = redis.opsForValue().getAndDelete(KEY_RESET + hash);

        if (storedPhone == null || !storedPhone.equals(phone)) {
            throw BusinessException.badRequest("重置链接已过期或无效");
        }

        // 3. 更新密码（用户不存在也静默成功，不暴露账号存在性）
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
        if (user != null) {
            user.setPasswordHash(passwordEncoder.encode(newPassword));
            userMapper.updateById(user);

            // RESET-03: 重置后吊销该用户所有 session
            deleteAllRefreshTokens(user.getId());
        }
    }

    // ========== Token 刷新（Rotation） ==========

    /** 刷新双 token（MAINT-03: 一次一换；MAINT-04: 重放检测） */
    public TokenResult refresh(String refreshToken, String deviceId) {
        String hash = sha256Hex(refreshToken);
        String key = KEY_REFRESH + hash;

        // 1. 消费旧 Refresh Token（getAndDelete = 一次性）
        String storedUserId = redis.opsForValue().getAndDelete(key);

        if (storedUserId == null) {
            // 2. 重放检测：检查是否已被消费（MAINT-04）
            String consumedKey = KEY_CONSUMED + hash;
            String replayedUserId = redis.opsForValue().get(consumedKey);
            if (replayedUserId != null) {
                log.warn("[AUTH] Refresh Token 重放攻击已检测, userId={}", replayedUserId);
                deleteAllRefreshTokens(Long.valueOf(replayedUserId));
                throw new BusinessException(
                        410, "REFRESH_TOKEN_REUSED", "Refresh Token 已被重复使用，所有设备已下线");
            }
            throw BusinessException.unauthorized("Refresh Token 无效或已过期");
        }

        Long userId = Long.valueOf(storedUserId);

        // 3. 标记已消费（短 TTL 窗口）
        redis.opsForValue().set(KEY_CONSUMED + hash, storedUserId, Duration.ofMinutes(30));

        // 4. 清除旧设备索引
        redis.delete(KEY_USER_DEVICE + userId + ":" + deviceId);

        // 5. 查用户并签发全新 Token
        User user = userMapper.selectById(userId);
        if (user == null) throw BusinessException.notFound("用户不存在");
        return issueTokens(user, deviceId);
    }

    // ========== 登出 ==========

    /** 登出：删除当前设备 refresh token */
    public void logout(Long userId, String deviceId) {
        String idxKey = KEY_USER_DEVICE + userId + ":" + deviceId;
        String storedHash = redis.opsForValue().getAndDelete(idxKey);
        if (storedHash != null) {
            redis.delete(KEY_REFRESH + storedHash);
        }
    }

    // ========== 限流 ==========

    /** 双维度限流（IP + 账号），被限流时走 dummy hash 保持时序一致（LOGIN-05, LOGIN-01） */
    private void rejectIfRateLimited(String phone, String password, String ip) {
        boolean ipLimited =
                RateLimiter.exceeded(
                        redis, RATE_IP_PWD + ip, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW));
        boolean userLimited =
                RateLimiter.exceeded(
                        redis,
                        RATE_USER_PWD + phone,
                        RATE_USER_MAX,
                        Duration.ofSeconds(RATE_USER_WINDOW));

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
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>().eq(User::getPhone, phone));
        String storedHash =
                user != null && user.getPasswordHash() != null
                        ? user.getPasswordHash()
                        : DUMMY_PASSWORD_HASH;

        boolean matched = passwordEncoder.matches(password, storedHash);

        if (user == null || !matched) {
            // UX-05: 日志精确记录失败原因
            if (user == null) {
                log.warn("[AUTH] 登录失败：用户不存在, phone={}, ip={}", maskPhone(phone), clientIp);
            } else if (user.getPasswordHash() == null) {
                log.warn("[AUTH] 登录失败：未设置密码, userId={}, ip={}", user.getId(), clientIp);
            } else {
                log.warn("[AUTH] 登录失败：密码错误, userId={}, ip={}", user.getId(), clientIp);
            }
            throw BusinessException.unauthorized("手机号或密码错误");
        }
        return user;
    }

    private void ensureUserActive(User user) {
        if (!STATUS_ACTIVE.equals(user.getStatus())) {
            throw new BusinessException(403, "USER_DISABLED", "账号已被禁用");
        }
    }

    // ========== Token 签发 ==========

    private TokenResult issueTokens(User user, String deviceId) {
        String accessToken = jwtProvider.createAccessToken(user.getId());
        String refreshToken = jwtProvider.generateRefreshToken();
        String hash = sha256Hex(refreshToken);

        // MAINT-01/02: 存 SHA-256 哈希，不落明文
        redis.opsForValue()
                .set(
                        KEY_REFRESH + hash,
                        user.getId().toString(),
                        Duration.ofMillis(REFRESH_TTL_MS));

        // 设备索引（按 deviceId 管理）
        redis.opsForValue()
                .set(
                        KEY_USER_DEVICE + user.getId() + ":" + deviceId,
                        hash,
                        Duration.ofMillis(REFRESH_TTL_MS));

        // 更新最后登录时间
        user.setLastLoginAt(OffsetDateTime.now());
        userMapper.updateById(user);

        return new TokenResult(accessToken, refreshToken);
    }

    // ========== Token 吊销 ==========

    /** 清除用户所有设备的 refresh token */
    public void deleteAllRefreshTokens(Long userId) {
        String pattern = KEY_USER_DEVICE + userId + ":*";
        Set<String> keys = redis.keys(pattern);
        if (keys == null || keys.isEmpty()) return;

        List<String> hashes = redis.opsForValue().multiGet(keys);
        redis.delete(keys);
        List<String> refreshKeys =
                hashes.stream().filter(Objects::nonNull).map(h -> KEY_REFRESH + h).toList();
        if (!refreshKeys.isEmpty()) {
            redis.delete(refreshKeys);
        }
    }

    // ========== 密码校验 ==========

    private void validatePassword(String password, String phone) {
        // REG-01: 最小长度 8 位
        if (password == null || password.length() < 8) {
            throw BusinessException.badRequest("密码长度至少 8 位");
        }
        // REG-06: BCrypt 72 字节限制
        if (password.length() > 72) {
            throw BusinessException.badRequest("密码长度不能超过 72 位");
        }
        // REG-05: 不与手机号相同
        if (password.equals(phone)) {
            throw BusinessException.badRequest("密码不能与手机号相同");
        }
        // REG-03: 常见密码黑名单
        if (COMMON_PASSWORDS.contains(password.toLowerCase())) {
            throw BusinessException.badRequest("密码过于常见，请更换");
        }
    }

    // ========== 工具方法 ==========

    private static String maskPhone(String phone) {
        if (phone == null || phone.length() < 7) return "****";
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    // ========== DTO ==========

    public record TokenResult(String accessToken, String refreshToken) {}
}
