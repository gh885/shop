package com.shop.platform.account.service;

import com.shop.platform.account.api.SubaccountFieldRules;
import com.shop.platform.account.api.SubaccountStatus;
import com.shop.platform.account.infra.CaptchaService;
import com.shop.platform.account.infra.UserAgentParser;
import com.shop.platform.account.mapper.ShopSubaccount;
import com.shop.platform.account.mapper.ShopSubaccountMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.SellerGrants;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.security.DeviceInfo;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.infra.security.RefreshTokenStore;
import com.shop.platform.infra.security.TokenPair;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 卖家子账号：凭证的建号 / 激活 / 登录 / 会话 / 停启用 / 重置口令。
 *
 * <p>子账号是第三种认证主体（{@code kind=subaccount}）。它<b>不是</b>买家账号的变体：
 * 没有 account.users 行，手机号在这里只是「激活时验证本人」的锚点，与买家那一套手机号账号体系互不相认
 * ——所以拿子账号凭证永远登不进买家端（各过滤链按 kind 拒绝），反过来买家手机号也不会自动获得卖家身份。
 *
 * <p>管理动作（建号 / 停启用 / 重置 / 改权 / 移除）由<b>店铺侧</b>的端点驱动（店主闸门住 shop 模块），
 * 经 {@code account::api} 调到这里；登录族由 {@code /auth/subaccount/**} 驱动。两类动作都收在本类，
 * 因为「一行子账号」的写入只有这一个出口。
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class SubaccountService {

    /** 登录名形状的编译结果（值取自 {@link SubaccountFieldRules#LOGIN_NAME_PATTERN}，不另抄一条） */
    private static final Pattern LOGIN_NAME = Pattern.compile(SubaccountFieldRules.LOGIN_NAME_PATTERN);

    /**
     * 登录限流：IP 10 次/60 秒、登录名 5 次/600 秒。与买家密码登录同档（见 {@code AuthService} 的同名常量）——
     * 两条登录入口对爆破的容忍度不该因为「提交的是手机号还是登录名」而不同。
     */
    private static final String RATE_IP = "rl:sub:ip:";

    private static final String RATE_NAME = "rl:sub:name:";
    private static final int RATE_IP_MAX = 10;
    private static final int RATE_IP_WINDOW = 60;
    private static final int RATE_NAME_MAX = 5;
    private static final int RATE_NAME_WINDOW = 600;

    private final ShopSubaccountMapper mapper;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;
    private final RefreshTokenStore refreshTokenStore;
    private final SmsCodeService smsCodeService;
    private final CaptchaService captchaService;
    private final StringRedisTemplate redis;

    // ————————————————————— 管理动作（店铺侧经 account::api 调用） —————————————————————

    /**
     * 建号：店主设登录名 + 初始口令 + 员工手机号，落 PENDING_ACTIVATION ——账号要等员工本人验过号才能用。
     *
     * <p>建号不发短信：发码入口是员工自己在登录页触发的（`/auth/subaccount/sms-code`），
     * 店主手里没有「给任意号码发短信」的能力。
     */
    @Transactional
    public ShopSubaccount create(
            UUID shopId, String loginName, String phone, String rawPassword, List<String> permissions) {
        // 1. 登录名归一 + 形状（DTO 已 @Valid，service 兜底：api 命令也可能被别的调用方用到）
        String name = Validate.requireText(loginName, "登录名");
        Validate.isTrue(
                name.length() >= SubaccountFieldRules.LOGIN_NAME_MIN
                        && name.length() <= SubaccountFieldRules.LOGIN_NAME_MAX,
                "登录名长度需在 " + SubaccountFieldRules.LOGIN_NAME_MIN + "~" + SubaccountFieldRules.LOGIN_NAME_MAX + " 字之间");
        Validate.isTrue(LOGIN_NAME.matcher(name).matches(), SubaccountFieldRules.LOGIN_NAME_PATTERN_MESSAGE);

        // 2. 手机号必须收得到短信：它后面要承接激活验证码，弱校验的号在这里就挡住，别等发码才失败
        Validate.isTrue(PhoneNumber.isChinaMobile(phone), "请输入正确的大陆手机号");
        String normalizedPhone = PhoneNumber.of(phone).value();

        // 3. 口令档与买家/员工同一份判定
        PasswordPolicy.require(rawPassword, normalizedPhone);

        // 4. 两处唯一性预检（并发由唯一索引兜）：登录名全局唯一、同店同号唯一
        Validate.isTrue(!mapper.existsByLoginName(name), "登录名已被使用，请换一个");
        Validate.isTrue(!mapper.existsByShopAndPhone(shopId, normalizedPhone), "该手机号在本店已有子账号");

        // 5. 落行：待激活 + 全量替换语义的权限码（白名单外一律 400）
        ShopSubaccount row = ShopSubaccount.builder()
                .shopId(shopId)
                .loginName(name)
                .phone(normalizedPhone)
                .passwordHash(passwordEncoder.encode(rawPassword))
                .status(SubaccountStatus.PENDING_ACTIVATION)
                .permissions(SellerGrants.sanitize(permissions))
                .build();
        try {
            mapper.insert(row);
        } catch (DuplicateKeyException e) {
            // 并发下两请求同时过了第 4 步：唯一索引是真相，回读判定是哪一格撞了，给和预检同一句话
            throw BusinessException.badRequest(mapper.existsByLoginName(name) ? "登录名已被使用，请换一个" : "该手机号在本店已有子账号");
        }
        log.info("[SUBACCOUNT] 建号成功, shopId={}, subaccountId={}, loginName={}", shopId, row.getId(), name);
        return row;
    }

    /** 本店全部子账号，先建号的在前 */
    public List<ShopSubaccount> listByShop(UUID shopId) {
        return mapper.selectByShop(shopId);
    }

    /** 本店某个子账号；别店的行与不存在的行一样给 null（调用方给同一句 404） */
    public ShopSubaccount findInShop(UUID subaccountId, UUID shopId) {
        return mapper.selectByIdAndShop(subaccountId, shopId);
    }

    /** 按 id 取会话主体行（自助端点 me / 改密用）；不存在即 404 */
    public ShopSubaccount requireById(UUID subaccountId) {
        return Validate.notNull(mapper.selectById(subaccountId), "子账号不存在");
    }

    /**
     * 按 id + 店铺取行：别店的子账号与不存在的子账号回答同一句 404
     * （口径同 ACC-79 的成员门——400 会把「这行存在、是别家的」说出来）。
     */
    public ShopSubaccount requireInShop(UUID subaccountId, UUID shopId) {
        return Validate.requireOwned(
                mapper.selectByIdAndShop(subaccountId, shopId), ShopSubaccount::getShopId, shopId, "子账号不存在");
    }

    /** 全量替换权限码（白名单外 400），下一请求即生效（判权每请求查库） */
    @Transactional
    public void replacePermissions(UUID subaccountId, List<String> permissions) {
        Validate.present(
                mapper.updatePermissions(subaccountId, SellerGrants.sanitize(permissions), OffsetDateTime.now()) == 1,
                "子账号不存在");
        log.info("[SUBACCOUNT] 调整权限, subaccountId={}, permissions={}", subaccountId, permissions);
    }

    /**
     * 停用 / 启用。
     *
     * <p>停用<b>不吊销 refresh token</b>：会话的失效靠判权每请求实时查库（{@code ShopMembershipFilter}
     * 取不到 ACTIVE 行即 403，刷新链同样重查状态），所以停用下一请求就生效，不需要再去 Redis 里处置。
     * 这与员工禁用那一档不同——员工 access 活 8 小时、判权不带状态闸门，只能同步吊销会话。
     */
    @Transactional
    public void setEnabled(UUID subaccountId, boolean enabled) {
        OffsetDateTime now = OffsetDateTime.now();
        if (!enabled) {
            Validate.conflict(mapper.disable(subaccountId, now) == 1, "子账号状态已变化，请刷新后重试");
            log.info("[SUBACCOUNT] 停用, subaccountId={}", subaccountId);
            return;
        }
        // 启用要把「验过没有」一起带上：没验过号的回 PENDING_ACTIVATION，不能让「启用」成为绕过手机验证的后门
        ShopSubaccount row = Validate.notNull(mapper.selectById(subaccountId), "子账号不存在");
        Validate.conflict(mapper.enable(subaccountId, row.getVerifiedAt() != null, now) == 1, "子账号状态已变化，请刷新后重试");
        log.info("[SUBACCOUNT] 启用, subaccountId={}", subaccountId);
    }

    /** 店主重置口令（子账号没有短信自助找回）：改完吊销全端会话，与买家改密同一后果（ACC-24） */
    @Transactional
    public void resetPassword(UUID subaccountId, String rawPassword) {
        ShopSubaccount row = Validate.notNull(mapper.selectById(subaccountId), "子账号不存在");
        PasswordPolicy.require(rawPassword, row.getPhone());
        Validate.present(
                mapper.updatePasswordHash(subaccountId, passwordEncoder.encode(rawPassword), OffsetDateTime.now()) == 1,
                "子账号不存在");
        revokeAllSessions(subaccountId);
        log.info("[SUBACCOUNT] 店主重置口令, subaccountId={}", subaccountId);
    }

    /** 移除 = 删行（与「停用」的区别：凭证不复存在，登录名与手机号占位一并释放） */
    @Transactional
    public void remove(UUID subaccountId) {
        mapper.deleteById(subaccountId);
        revokeAllSessions(subaccountId);
        log.info("[SUBACCOUNT] 移除, subaccountId={}", subaccountId);
    }

    // ————————————————————— 会话装载（卖家过滤器每请求调用） —————————————————————

    /** 判权用的会话：只认 ACTIVE；不存在/待激活/已停用一律 empty（fail-close 的那一侧由调用方给 403） */
    public ShopSubaccount findActiveSession(UUID subaccountId) {
        ShopSubaccount row = mapper.selectById(subaccountId);
        return row != null && row.getStatus() == SubaccountStatus.ACTIVE ? row : null;
    }

    /** 本人自助改密：要验当前口令（子账号没有短信通道，也没有「忘了」这一格——忘了找店主重置） */
    @Transactional
    public void changePassword(UUID subaccountId, String currentPassword, String newPassword) {
        ShopSubaccount row = Validate.notNull(mapper.selectById(subaccountId), "子账号不存在");
        if (currentPassword == null || !passwordEncoder.matches(currentPassword, row.getPasswordHash())) {
            throw BusinessException.unauthorized("当前密码错误");
        }
        PasswordPolicy.require(newPassword, row.getPhone());
        Validate.present(
                mapper.updatePasswordHash(subaccountId, passwordEncoder.encode(newPassword), OffsetDateTime.now()) == 1,
                "子账号不存在");
        revokeAllSessions(subaccountId);
        log.info("[SUBACCOUNT] 自助改密, subaccountId={}", subaccountId);
    }

    // ————————————————————— 登录族（/auth/subaccount/** 调用） —————————————————————

    /**
     * 发送激活验证码：发给「该登录名名下那一行登记的号码」。
     *
     * <p>三道门与买家发码入口同档（ACC-35 的立约）：图形验证码 → 登录名/号码必须对得上 → 频控与短信码。
     * 号码虽然由请求方自报，但必须与那一行一致——这一步把「一个匿名端点给任意号码发短信」变成
     * 「只能给一条已存在的待激活记录上的号发短信」。
     *
     * <p>对不上时一律同一句 400：登录名不存在、号码不匹配、状态不是待激活，三种情况话术不分家，
     * 否则这个匿名端点就成了「登录名存不存在」的探针。
     */
    public void sendActivationCode(
            String loginName, String phone, String captchaId, String captchaCode, String clientIp) {
        // 1. 人机验证先消费：被后面任一关拒掉时那枚图形码也已经用掉（廉价凭证先失败，ACC-35）
        captchaService.verify(captchaId, captchaCode);

        // 2. 定位待激活行：三种不匹配同一个答案
        ShopSubaccount row = requirePendingMatch(loginName, phone);

        // 3. 发码（IP/号码频控与日限由 SmsCodeService 统一执行）
        smsCodeService.sendActivationCode(row.getPhone(), clientIp);
        log.info("[SUBACCOUNT] 激活验证码已发送, subaccountId={}", row.getId());
    }

    /**
     * 激活（首次登录）：验本人手机号 → 置 ACTIVE → 直接签发会话，省掉「激活完再登一次」。
     *
     * <p>激活写的是<b>条件更新</b>（{@code WHERE status = PENDING_ACTIVATION}）：与店主的停用相撞时
     * 只有一个抢得到，抢不到给 409 而不是把停用状态覆盖回 ACTIVE。
     */
    @Transactional
    public TokenPair activate(
            String loginName, String phone, String code, String deviceId, String clientIp, String userAgent) {
        // 1. 定位待激活行（与发码同一道门，同一个答案）
        ShopSubaccount row = requirePendingMatch(loginName, phone);

        // 2. 校验并消费验证码（尝试上限、一次性消费、哈希比对在 SmsCodeService）
        smsCodeService.verifyActivationCode(row.getPhone(), code);

        // 3. 条件转移：抢不到说明行已被停用或已被店主移除
        Validate.conflict(mapper.activate(row.getId(), OffsetDateTime.now()) == 1, "子账号状态已变化，请刷新后重试");
        row.setStatus(SubaccountStatus.ACTIVE);
        log.info("[SUBACCOUNT] 激活成功, subaccountId={}, shopId={}", row.getId(), row.getShopId());

        // 4. 签发会话：激活即登录
        return issueTokens(row, deviceId, clientIp, userAgent);
    }

    /**
     * 口令登录。三种失败对外同一句话（{@code 登录名或密码错误}）：不存在的登录名 / 口令错 / 待激活
     * 之外的两档都不该被外人分辨出来——待激活那一档例外，员工必须知道自己「还没激活」才知道下一步做什么。
     */
    public TokenPair login(String loginName, String password, String deviceId, String clientIp, String userAgent) {
        String name = loginName == null ? "" : loginName.trim();

        // 1. 限流：两个维度任一超限即拒；被限流时同样跑一次 dummy 哈希（响应耗时与真实失败一致）
        rejectIfRateLimited(name, password, clientIp);

        // 2. 校验凭证（查不到行时对 dummy 哈希白算一次，堵按耗时做登录名枚举）
        ShopSubaccount row = mapper.selectByLoginName(name);
        String storedHash = row != null ? row.getPasswordHash() : AuthService.DUMMY_PASSWORD_HASH;
        boolean matched = passwordEncoder.matches(password, storedHash);
        if (row == null || !matched) {
            log.warn(
                    "[SUBACCOUNT] 登录失败, loginName={}, client_ip={}, reason={}",
                    name,
                    clientIp,
                    row == null ? "not_found" : "wrong_password");
            throw BusinessException.unauthorized("登录名或密码错误");
        }

        // 3. 状态闸门：待激活要能引导到激活流程（前端按码切换步骤），停用只需一句明话
        if (row.getStatus() == SubaccountStatus.PENDING_ACTIVATION) {
            throw BusinessException.forbidden(ErrorCodes.SUBACCOUNT_NOT_ACTIVATED, "子账号还未激活，请先验证手机号");
        }
        if (row.getStatus() != SubaccountStatus.ACTIVE) {
            log.warn("[SUBACCOUNT] 停用中的子账号仍在尝试登录, subaccountId={}, client_ip={}", row.getId(), clientIp);
            throw BusinessException.forbidden("子账号已停用，请联系店主");
        }

        // 4. 登录成功清失败计数，签发会话
        clearRateLimit(name, clientIp);
        log.info("[SUBACCOUNT] 登录成功, subaccountId={}, shopId={}", row.getId(), row.getShopId());
        return issueTokens(row, deviceId, clientIp, userAgent);
    }

    /** 刷新：轮换 + 重放裁决在 RefreshTokenStore，这里补一道状态闸门（停用/移除后旧 refresh 不再换出新会话） */
    public TokenPair refresh(String refreshToken, String deviceId, String clientIp, String userAgent) {
        RefreshTokenStore.Rotation rotated = refreshTokenStore.rotate(refreshToken, deviceId, "[SUBACCOUNT]");
        ShopSubaccount row = mapper.selectById(UUID.fromString(rotated.subjectId()));
        if (row == null) {
            throw BusinessException.unauthorized("子账号不存在");
        }
        if (row.getStatus() != SubaccountStatus.ACTIVE) {
            throw BusinessException.forbidden("子账号已停用，请联系店主");
        }
        return issueTokens(row, rotated.deviceId(), clientIp, userAgent);
    }

    /** 登出当前设备（只吊销这一台；子账号没有设备列表页，其余会话由店主停用/重置口令收场） */
    public void logout(UUID subaccountId, String deviceId) {
        refreshTokenStore.revokeDevice(subaccountId.toString(), deviceId);
    }

    /** 吊销该子账号全部设备的会话（重置口令 / 自助改密 / 移除时调用） */
    private void revokeAllSessions(UUID subaccountId) {
        refreshTokenStore.revokeAll(subaccountId.toString());
    }

    // ————————————————————— 私有 —————————————————————

    /**
     * 定位「登录名 + 手机号 + 待激活」三者同时成立的那一行；任一不成立给同一句 400。
     *
     * <p>话术不分家是刻意的：这个入口匿名可达，如果「登录名不存在」与「号码不对」给不同答案，
     * 它就成了登录名枚举器。
     */
    private ShopSubaccount requirePendingMatch(String loginName, String phone) {
        ShopSubaccount row = mapper.selectByLoginName(loginName == null ? "" : loginName.trim());
        boolean matches = row != null
                && PhoneNumber.isChinaMobile(phone)
                && row.getPhone().equals(PhoneNumber.of(phone).value())
                && row.getStatus() == SubaccountStatus.PENDING_ACTIVATION;
        if (!matches) {
            throw BusinessException.badRequest("登录名或手机号不正确，或该子账号已激活");
        }
        return row;
    }

    /** 签发一对令牌：access 带 kind=subaccount，refresh 只存摘要并记设备元数据（设备名/IP/时间） */
    private TokenPair issueTokens(ShopSubaccount row, String deviceId, String clientIp, String userAgent) {
        String accessToken = jwtProvider.createSubaccountAccessToken(row.getId());
        String refreshToken = jwtProvider.generateRefreshToken();
        DeviceInfo deviceInfo = new DeviceInfo(UserAgentParser.parse(userAgent), clientIp, OffsetDateTime.now());
        refreshTokenStore.issue(row.getId().toString(), deviceId, refreshToken, deviceInfo);
        return new TokenPair(accessToken, refreshToken);
    }

    /**
     * 登录限流闸门。被限流时仍跑一次 BCrypt（对 dummy 哈希）——否则「被限流」比「口令错」快一个数量级，
     * 脚本据此就能判断哪些登录名正在被人撞（买家侧同一条口径，见 {@code AuthService.rejectIfRateLimited}）。
     */
    private void rejectIfRateLimited(String loginName, String password, String clientIp) {
        boolean ipLimited =
                RateLimiter.exceeded(redis, RATE_IP + clientIp, RATE_IP_MAX, Duration.ofSeconds(RATE_IP_WINDOW));
        boolean nameLimited =
                RateLimiter.exceeded(redis, RATE_NAME + loginName, RATE_NAME_MAX, Duration.ofSeconds(RATE_NAME_WINDOW));
        if (ipLimited || nameLimited) {
            passwordEncoder.matches(password, AuthService.DUMMY_PASSWORD_HASH);
            log.warn("[SUBACCOUNT] 登录被限流, loginName={}, client_ip={}", loginName, clientIp);
            throw BusinessException.rateLimited("登录过于频繁，请稍后再试");
        }
    }

    /** 登录成功后清除两侧计数（与买家密码登录同一口径：成功即归零，不让历史失败拖累下一次） */
    private void clearRateLimit(String loginName, String clientIp) {
        redis.delete(RATE_NAME + loginName);
        redis.delete(RATE_IP + clientIp);
    }
}
