package com.shop.platform.account.service;

import com.shop.platform.account.AccountProperties;
import com.shop.platform.account.internal.DevSmsChannel;
import com.shop.platform.account.internal.SmsChannel;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.security.RateLimiter;
import com.shop.platform.infra.security.SecretHasher;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.function.UnaryOperator;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

/**
 * 短信 OTP 的发送与校验。登录、找回密码、注销三套用途只有 key 前缀不同，防线完全一致，
 * 收成一条通用路径——「发码防线有四道」这种事不允许每个用途各背一份。
 */
@Service
public class SmsCodeService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String KEY_CODE = "sms:code:";
    private static final String KEY_RATE = "sms:rate:";
    private static final String KEY_DAILY = "sms:daily:";
    private static final String KEY_ATTEMPT = "sms:attempt:";
    private static final String KEY_IP_RATE = "sms:ip:";

    // 找回密码验证码：与登录验证码同一套防线，只有 key 前缀不同
    private static final String KEY_RESET_CODE = "reset:code:";
    private static final String KEY_RESET_RATE = "reset:rate:";
    private static final String KEY_RESET_ATTEMPT = "reset:attempt:";

    // 注销验证码：第三套用途。注销是不可逆的毁灭动作，凭证不能只是「当前会话还活着」——
    // 令牌被盗即可远程删号，故必须再向绑定手机号要一次性码（防线同登录/重置）
    private static final String KEY_DELETION_CODE = "deletion:code:";
    private static final String KEY_DELETION_RATE = "deletion:rate:";
    private static final String KEY_DELETION_ATTEMPT = "deletion:attempt:";

    private static final long CODE_TTL_MINUTES = 5;
    private static final long RATE_TTL_SECONDS = 60; // 重发间隔
    private static final int DAILY_LIMIT = 20; // 每手机号每日上限
    private static final int IP_RATE_MAX = 10; // 每 IP 每分钟上限
    private static final int MAX_ATTEMPTS = 5; // 最大尝试次数
    private static final int CODE_LENGTH = 6;

    private final StringRedisTemplate redis;
    private final RateLimiter rateLimiter;
    private final SmsChannel smsChannel;
    private final SecretHasher secretHasher;
    /** 开发固定码通道是条件装配，经 ObjectProvider 注入；生产不存在，固定码分支恒假 */
    private final ObjectProvider<DevSmsChannel> devChannel;

    private final AccountProperties props;

    public SmsCodeService(
            StringRedisTemplate redis,
            RateLimiter rateLimiter,
            SmsChannel smsChannel,
            SecretHasher secretHasher,
            ObjectProvider<DevSmsChannel> devChannel,
            AccountProperties props) {
        this.redis = redis;
        this.rateLimiter = rateLimiter;
        this.smsChannel = smsChannel;
        this.secretHasher = secretHasher;
        this.devChannel = devChannel;
        this.props = props;
    }

    /** 发送登录验证码 */
    public void sendCode(String phone, String clientIp) {
        sendOtp(KEY_CODE, KEY_RATE, KEY_ATTEMPT, phone, clientIp, code -> code);
    }

    /** 发送找回密码验证码 */
    public void sendResetCode(String phone, String clientIp) {
        sendOtp(KEY_RESET_CODE, KEY_RESET_RATE, KEY_RESET_ATTEMPT, phone, clientIp, code -> "重置密码验证码: " + code);
    }

    /** 校验登录验证码 */
    public void verifyCode(String phone, String code) {
        consumeOtp(KEY_CODE, KEY_ATTEMPT, phone, code);
    }

    /** 校验找回密码验证码 */
    public void verifyResetCode(String phone, String code) {
        consumeOtp(KEY_RESET_CODE, KEY_RESET_ATTEMPT, phone, code);
    }

    /**
     * 发送注销验证码：只发给<b>已登录本人</b>绑定的手机号（号码取自 token，不由请求方自报），
     * 所以这条路径不需要图形验证码——人机验证防的是未认证端点的号码轰炸，此处认证已过、
     * IP 与日限两层频控照旧生效。
     */
    public void sendDeletionCode(String phone, String clientIp) {
        sendOtp(KEY_DELETION_CODE, KEY_DELETION_RATE, KEY_DELETION_ATTEMPT, phone, clientIp, code -> "注销验证码: " + code);
    }

    /** 校验注销验证码 */
    public void verifyDeletionCode(String phone, String code) {
        consumeOtp(KEY_DELETION_CODE, KEY_DELETION_ATTEMPT, phone, code);
    }

    /**
     * OTP 发送通用路径：限流防线（IP / 单 IP 去重号码 / 60s 冷却 / 日限）→ 生成 6 位码 →
     * HMAC 摘要落 Redis → 发送。
     *
     * @param text 文案定型：登录裸码直发，重置与注销带用途前缀（可人工输入的短码，而非长随机 token）
     */
    private void sendOtp(
            String codePrefix,
            String ratePrefix,
            String attemptPrefix,
            String phone,
            String clientIp,
            UnaryOperator<String> text) {
        // 1. 限流检查：IP 维度 + 单 IP 每日不同手机号数（防横扫轰炸）
        if (rateLimiter.exceeded(KEY_IP_RATE + clientIp, IP_RATE_MAX, Duration.ofMinutes(1))) {
            throw BusinessException.rateLimited(ErrorCodes.SMS_RATE_LIMIT, "发送过于频繁，请稍后再试");
        }
        enforceDistinctPhonesPerIp(clientIp, phone);

        // 2. 限流检查：60s 重发间隔 + 每日上限（冷却占位与日限计数都是一条语句，先读后写会漏发第二条真短信）
        String rateKey = ratePrefix + phone;
        if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(rateKey, "1", Duration.ofSeconds(RATE_TTL_SECONDS)))) {
            throw BusinessException.rateLimited(ErrorCodes.SMS_RATE_LIMIT, "发送过于频繁，请稍后再试");
        }
        if (rateLimiter.exceeded(KEY_DAILY + phone, DAILY_LIMIT, Duration.ofDays(1))) {
            redis.delete(rateKey);
            throw BusinessException.rateLimited(ErrorCodes.SMS_DAILY_LIMIT, "今日验证码已达上限");
        }

        // 3. 生成验证码，存 HMAC 摘要（pepper 在应用配置，拖库不可离线枚举）
        String code = String.format("%0" + CODE_LENGTH + "d", SECURE_RANDOM.nextInt(1_000_000));
        redis.opsForValue()
                .set(codePrefix + phone, secretHasher.hash(phone + ":" + code), Duration.ofMinutes(CODE_TTL_MINUTES));

        // 4. 重发后清旧尝试计数（重发即给全新 5 次机会）；冷却标记已在步骤 2 原子占位
        redis.delete(attemptPrefix + phone);

        // 5. 发送
        smsChannel.sendCode(phone, text.apply(code));
    }

    /**
     * OTP 校验通用路径：尝试上限检查 → 哈希比对 → 成功才消费。
     *
     * <p>错误不烧码：错满 MAX_ATTEMPTS 次才作废，之前验证码保留供用户更正重输（手滑友好）；
     * 猜测空间被封顶为 10^6 中至多 5 次，无需在验证接口另设限流。读-比对-删非原子，
     * 并发同码双过的窗口收益极小，接受。
     */
    private void consumeOtp(String codePrefix, String attemptPrefix, String phone, String code) {
        // 1. 取哈希并检查尝试次数：无哈希 = 未发/已过期（不计数，防刷计数器）
        String codeKey = codePrefix + phone;
        String attemptKey = attemptPrefix + phone;
        String storedHash = redis.opsForValue().get(codeKey);
        if (storedHash == null) {
            throw BusinessException.badRequest(ErrorCodes.SMS_CODE_EXPIRED, "验证码已过期");
        }
        String attemptStr = redis.opsForValue().get(attemptKey);
        int attempts = attemptStr != null ? Integer.parseInt(attemptStr) : 0;
        if (attempts >= MAX_ATTEMPTS) {
            redis.delete(codeKey);
            throw BusinessException.badRequest(ErrorCodes.SMS_CODE_EXPIRED, "验证码已过期，请重新发送");
        }

        // 2. 开发环境固定码优先放行（dev 通道未装配时跳过）
        DevSmsChannel dev = devChannel.getIfAvailable();
        if (dev != null && dev.DEV_CODE.equals(code)) {
            redis.delete(attemptKey);
            return;
        }

        // 3. 哈希比对：存储的是 HMAC-SHA256(pepper, phone:code)，拖库也无法离线枚举低熵验证码
        if (!secretHasher.hash(phone + ":" + code).equals(storedHash)) {
            Long hits = redis.opsForValue().increment(attemptKey);
            redis.expire(attemptKey, Duration.ofMinutes(CODE_TTL_MINUTES));
            if (hits != null && hits >= MAX_ATTEMPTS) {
                redis.delete(codeKey); // 第 5 次错误即焚，后续输入直接走「已过期」
            }
            throw BusinessException.badRequest(ErrorCodes.SMS_CODE_INVALID, "验证码错误");
        }

        // 4. 校验通过：消费验证码 + 清除尝试计数
        redis.delete(codeKey);
        redis.delete(attemptKey);
    }

    /**
     * 单 IP 每日不同手机号数上限。先判容量再 SADD：被拒的新号码不该占坑。反过来（先加后判）
     * 会让越界后的每次尝试都把集合撑大一格，攻击者反而能用被拒请求持续膨胀这个 key。
     * SADD 原子返回是否新增：既有号码复发不受影响。
     */
    private void enforceDistinctPhonesPerIp(String clientIp, String phone) {
        String key = "sms:ip:phones:" + clientIp;
        if (!Boolean.TRUE.equals(redis.opsForSet().isMember(key, phone))) {
            Long size = redis.opsForSet().size(key);
            if (size != null && size >= props.smsIpDistinctPhonesMax()) {
                throw BusinessException.rateLimited(ErrorCodes.SMS_RATE_LIMIT, "发送过于频繁，请稍后再试");
            }
        }
        if (Long.valueOf(1L).equals(redis.opsForSet().add(key, phone))) {
            redis.expire(key, Duration.ofDays(1));
        }
    }
}
