package com.shop.platform.account.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.shop.platform.account.dto.AccountFieldRules;
import com.shop.platform.account.dto.AdminUserQuery;
import com.shop.platform.account.infra.RateLimiter;
import com.shop.platform.account.infra.UserAgentParser;
import com.shop.platform.account.mapper.User;
import com.shop.platform.account.mapper.UserMapper;
import com.shop.platform.account.model.UserStatus;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PageParams;
import com.shop.platform.common.PageResult;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.observability.BizEvent;
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

    // Password reset（这里只做业务编排）

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

    // 短信登录/注册
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
        ensureLoginActive(user, clientIp);

        // 4. 签发 Token；登录成功事件打在入口而不是 issueTokens 里——刷新也走同一个签发方法，
        //    打在里面会把「续期」计成「登录」，登录量与漏斗都失真
        TokenPair tokens = issueTokens(user, deviceId, clientIp, userAgent);
        BizEvent.of("auth.login.succeeded")
                .put("user_id", user.getId())
                .put("via", "sms")
                .emit();
        return tokens;
    }

    // 密码登录
    public TokenPair loginByPassword(
            String phone, String password, String deviceId, String clientIp, String userAgent) {

        // 1. 限流检查（被限流时走 dummy hash 防时序探测）
        rejectIfRateLimited(phone, password, clientIp);

        // 2. 验证凭证
        User user = authenticate(phone, password, clientIp);

        // 3. 检查账号状态
        ensureLoginActive(user, clientIp);

        // 4. 登录成功清除失败计数（LOGIN-08）
        clearPasswordRateLimit(phone, clientIp);

        // 5. 签发 Token
        TokenPair tokens = issueTokens(user, deviceId, clientIp, userAgent);
        BizEvent.of("auth.login.succeeded")
                .put("user_id", user.getId())
                .put("via", "password")
                .emit();
        return tokens;
    }

    // 设置/修改密码
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

        // 口令被更换 + 全端会话被吊销，是一次账号接管里最需要被检索到的那行
        BizEvent.of("auth.password.changed")
                .put("user_id", userId)
                .put("via", "self")
                .emit();
    }

    // 密码重置
    /** 发送重置密码验证码（RESET-01/02） */
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
            // 与 setPassword 同一个事件：走短信码改密和走当前密码改密是同一后果（口令更换 + 全端下线），
            // 只有 via 不同——取证时按 user_id 串起来看的是「谁在什么时候换掉了这个号」
            BizEvent.of("auth.password.changed")
                    .put("user_id", user.getId())
                    .put("via", "reset_code")
                    .emit();
        }
    }

    // Token 刷新（Rotation）
    /** 刷新双 token（MAINT-03: 一次一换；MAINT-04: 重放检测） */
    public TokenPair refresh(String refreshToken, String deviceId, String clientIp, String userAgent) {
        // 1~4. 消费旧码 + 重放裁决 + 标记消费 + 清旧设备索引；设备身份以 token 绑定为准（web/seller
        //      共享 refresh cookie 会交替提交不同 deviceId，见 RefreshTokenStore.rotate），新码沿用同一条
        RefreshTokenStore.Rotation rotated = refreshTokenStore.rotate(refreshToken, deviceId, "[AUTH]");

        // 5. 查用户并签发全新 Token；禁用账号在此拦截——旧码已消费、新码不签发，封号即等于吊销全部会话
        User user = userMapper.selectById(UUID.fromString(rotated.subjectId()));
        if (user == null) throw BusinessException.notFound("用户不存在");
        ensureUserActive(user);
        TokenPair tokens = issueTokens(user, rotated.deviceId(), clientIp, userAgent);
        // 续期不是登录（登录量只在两个 login* 入口打），但它同样是一次会话易主，值得单独可检索
        BizEvent.of("auth.token.refreshed").put("user_id", user.getId()).emit();
        return tokens;
    }

    // 当前用户
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
            if (trimmed.length() > AccountFieldRules.NICKNAME_MAX) {
                throw BusinessException.badRequest("昵称不能超过 " + AccountFieldRules.NICKNAME_MAX + " 字");
            }
            user.setNickname(trimmed);
        }
        if (avatarKey != null) {
            user.setAvatarKey(Text.blankToNull(avatarKey));
        }
        userMapper.updateById(user);
        return user;
    }

    // 设备管理
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

    // 登出
    /** 登出：删除当前设备 refresh token */
    public void logout(UUID userId, String deviceId) {
        refreshTokenStore.revokeDevice(userId.toString(), deviceId);
    }

    /** 管理端买家列表：手机号/昵称关键字与状态筛选，手机号只出脱敏值。 */
    @Transactional(readOnly = true)
    public PageResult<AdminUserItem> pageAdminUsers(PageParams pageParams, AdminUserQuery query) {
        // 1. 枚举筛选在 service 入口归一，非法值与项目其他管理列表同为 400。
        UserStatus status = Validate.enumFilter(UserStatus.class, query.status(), "非法的用户状态筛选值");
        String keyword = Text.blankToNull(query.keyword());

        // 2. 关键字同时命中手机号与昵称；手机号按原值前缀/包含匹配，列表出参再统一脱敏。
        Page<User> rows = userMapper.selectPage(
                new Page<>(pageParams.page(), pageParams.size()),
                new LambdaQueryWrapper<User>()
                        .eq(status != null, User::getStatus, status)
                        .and(
                                keyword != null,
                                q -> q.like(User::getPhone, keyword).or().like(User::getNickname, keyword))
                        .orderByDesc(User::getCreatedAt));

        // 3. mapper 行只出治理所需字段，避免把密码哈希、头像 key、注销内部状态带进 HTTP 契约。
        return new PageResult<>(
                rows.getRecords().stream()
                        .map(user -> new AdminUserItem(
                                user.getId(),
                                PhoneNumber.mask(user.getPhone()),
                                user.getNickname(),
                                user.getStatus(),
                                user.getLastLoginAt(),
                                user.getCreatedAt()))
                        .toList(),
                rows.getTotal());
    }

    // 管理端封号（PATCH /admin/users/{id}/status）
    /**
     * 设置买家账号状态（禁用/启用，ACC-16 两态）。
     *
     * <p>禁用刻意<b>不同步</b>吊销 refresh——既有闸门链已自然闭合，验证如下： 1) 在途 access token 无黑名单，最长剩 10 分钟寿命
     * 后过期（ACC-19/ACC-25 已接受的取舍）； 2) 之后任何刷新都会先消费旧 refresh（rotate）再撞
     * {@link #refresh} 里的 ensureUserActive——旧码已废、新码不签发， 全部会话在 10 分钟窗口后自然死亡；被消费的旧码若重放还会触发
     * REFRESH_TOKEN_REUSED 全端吊销（ACC-22），无复活路径； 3) 重新登录（短信/密码）被 USER_DISABLED
     * 闸门直接拦（短信通道不能绕过）。 启用即恢复：闸门查实时状态，status 回 ACTIVE 后登录/刷新恢复放行。
     */
    public void updateUserStatus(UUID userId, UserStatus status, UUID staffId) {
        User user = userMapper.selectById(userId);
        if (user == null) throw BusinessException.notFound("用户不存在");
        user.setStatus(status);
        userMapper.updateById(user);
        // 封号是人对人做的动作，操作人必须落在同一条事件里（口径同 shop_review.decided）
        BizEvent.of("account.status.changed")
                .put("user_id", userId)
                .put("status", status)
                .put("staff_id", staffId)
                .emit();
    }

    // 限流
    /** 双维度限流（IP + 账号），被限流时走 dummy hash 保持时序一致（LOGIN-05, LOGIN-01） */
    private void rejectIfRateLimited(String phone, String password, String ip) {
        boolean ipLimited =
                RateLimiter.exceeded(redis, RATE_IP_PWD + ip, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW));
        boolean userLimited =
                RateLimiter.exceeded(redis, RATE_USER_PWD + phone, RATE_USER_MAX, Duration.ofSeconds(RATE_USER_WINDOW));

        if (ipLimited || userLimited) {
            // 限流时仍执行 BCrypt 对比，防止通过返回时长探测账号是否存在（LOGIN-01）
            passwordEncoder.matches(password, DUMMY_PASSWORD_HASH);
            // 命中限流 = 爆破正在进行，这是最该被检索到的一次失败；对外文案仍与凭证失败同一句
            BizEvent.of("auth.login.failed")
                    .put("reason", "rate_limited")
                    .put("client_ip", ip)
                    .put("phone", PhoneNumber.mask(phone))
                    .warn();
            throw BusinessException.unauthorized("手机号或密码错误");
        }
    }

    private void clearPasswordRateLimit(String phone, String ip) {
        redis.delete(RATE_IP_PWD + ip);
        redis.delete(RATE_USER_PWD + phone);
    }

    // 凭证验证
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

    /**
     * 登录失败的统一出口：对外一律同一句话，精确原因只进事件（{@code reason} 供运营揪撞库与聚合，
     * GEN-49 要求枚举值）；未注册那支没有 user_id 可记，改带掩码号——身份仍是不可反推的形状。
     */
    private BusinessException loginRejected(User user, String phone, String clientIp) {
        String reason;
        if (user == null) {
            reason = "user_not_found";
        } else if (user.getPasswordHash() == null) {
            reason = "no_password";
        } else {
            reason = "wrong_password";
        }
        BizEvent.of("auth.login.failed")
                .put("reason", reason)
                .put("client_ip", clientIp)
                .put("user_id", user == null ? null : user.getId())
                .put("phone", user == null ? PhoneNumber.mask(phone) : null)
                .warn();
        return BusinessException.unauthorized("手机号或密码错误");
    }

    private void ensureUserActive(User user) {
        if (!user.isActive()) {
            throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被禁用");
        }
    }

    /**
     * 登录路径的禁用闸门：对外仍是同一个 USER_DISABLED 403，但「已封的号还在试口令」本身是审计信号，
     * 过去只有响应体、日志里查不到（reason=disabled 与凭证层的三种失败同名不同值）。
     * 刷新路径不打它——那是一次续期，不是一次登录尝试。
     */
    private void ensureLoginActive(User user, String clientIp) {
        if (user.isActive()) {
            return;
        }
        BizEvent.of("auth.login.failed")
                .put("reason", "disabled")
                .put("client_ip", clientIp)
                .put("user_id", user.getId())
                .warn();
        throw BusinessException.forbidden(ErrorCodes.USER_DISABLED, "账号已被禁用");
    }

    // Token 签发
    private TokenPair issueTokens(User user, String deviceId, String clientIp, String userAgent) {
        String accessToken = jwtProvider.createAccessToken(user.getId());
        String refreshToken = jwtProvider.generateRefreshToken();

        // MAINT-01/02: 只存 HMAC 摘要不落明文；随签发记录设备元数据（设备名/IP/时间），供设备列表展示
        DeviceInfo deviceInfo = new DeviceInfo(UserAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(user.getId().toString(), deviceId, refreshToken, deviceInfo);

        // 更新最后登录时间
        user.setLastLoginAt(OffsetDateTime.now());
        userMapper.updateById(user);

        // 这里不打业务事件：登录/刷新两条路径都汇到本方法，事件归入口（见 loginBySms 注释）
        return new TokenPair(accessToken, refreshToken);
    }

    // Token 吊销
    /** 清除用户所有设备的 refresh token */
    public void deleteAllRefreshTokens(UUID userId) {
        refreshTokenStore.revokeAll(userId.toString());
    }

    // 密码校验
    private void validatePassword(String password, String phone) {
        // REG-01: 最小长度与 DTO 那一格同一个数（AccountFieldRules.PASSWORD_MIN）
        if (password == null || password.length() < AccountFieldRules.PASSWORD_MIN) {
            throw BusinessException.badRequest("密码长度至少 " + AccountFieldRules.PASSWORD_MIN + " 位");
        }
        // REG-06: BCrypt 的 72 是「字节」上限，不是字符数（多字节字符会超 72 字节导致编码失败/截断失配）
        //         ——所以 DTO 的字符档（PASSWORD_MAX）放得进来的，这里还要再过一道字节档
        if (password.getBytes(StandardCharsets.UTF_8).length > AccountFieldRules.BCRYPT_INPUT_MAX_BYTES) {
            throw BusinessException.badRequest("密码长度不能超过 " + AccountFieldRules.BCRYPT_INPUT_MAX_BYTES + " 位");
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

    // 工具方法
}
