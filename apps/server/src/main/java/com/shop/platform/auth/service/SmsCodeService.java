package com.shop.platform.auth.service;

import com.shop.platform.auth.infra.DevSmsChannel;
import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.common.BusinessException;
import com.shop.platform.infra.security.SecretHasher;
import com.shop.platform.infra.util.RateLimiter;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.function.UnaryOperator;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class SmsCodeService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String KEY_CODE = "sms:code:";
    private static final String KEY_RATE = "sms:rate:";
    private static final String KEY_DAILY = "sms:daily:";
    private static final String KEY_ATTEMPT = "sms:attempt:";
    private static final String KEY_IP_RATE = "sms:ip:";

    // 重置密码验证码：与登录验证码同一套防线，只有 key 前缀不同
    private static final String KEY_RESET_CODE = "reset:code:";
    private static final String KEY_RESET_RATE = "reset:rate:";
    private static final String KEY_RESET_ATTEMPT = "reset:attempt:";

    private static final long CODE_TTL = 5; // 验证码有效 5 分钟
    private static final long RATE_TTL = 60; // 重发间隔 60 秒
    private static final int DAILY_LIMIT = 20; // 每手机号每日上限
    private static final int IP_RATE_MAX = 10; // 每 IP 每分钟上限
    private static final int MAX_ATTEMPTS = 5; // 最大尝试次数
    private static final int IP_DISTINCT_PHONES_MAX = 5; // 每 IP 每日不同手机号上限（防单 IP 横扫大量号码轰炸）

    private final StringRedisTemplate redis;
    private final SmsChannel smsChannel;
    private final SecretHasher secretHasher;
    private final ObjectProvider<DevSmsChannel> devSmsChannelProvider;

    /** 发送验证码 */
    public void sendCode(String phone, String clientIp) {
        sendOtp(KEY_CODE, KEY_RATE, KEY_ATTEMPT, phone, clientIp, code -> code);
    }

    /** 发送重置密码验证码：频控防线与哈希存储复用登录验证码（sendOtp），仅 key 前缀与短信文案不同 */
    public void sendResetCode(String phone, String clientIp) {
        sendOtp(KEY_RESET_CODE, KEY_RESET_RATE, KEY_RESET_ATTEMPT, phone, clientIp, code -> "重置密码验证码: " + code);
    }

    /** 校验登录验证码 */
    public void verifyCode(String phone, String code) {
        consumeOtp(KEY_CODE, KEY_ATTEMPT, phone, code);
    }

    /** 校验重置密码验证码；防线与登录验证码一致（尝试上限、一次性消费、哈希比对） */
    public void verifyResetCode(String phone, String code) {
        consumeOtp(KEY_RESET_CODE, KEY_RESET_ATTEMPT, phone, code);
    }

    /**
     * OTP 发送通用路径：限流防线（IP / 单 IP 去重号码 / 60s 冷却 / 日限）→ 生成 6 位码 → HMAC 摘要落 Redis → 发送。
     * 登录与重置两套验证码只有 key 前缀不同；校验侧的对称收敛见 consumeOtp。
     *
     * @param text 文案定型：登录裸码直发，重置带用途前缀（可人工输入的短码，而非长随机 token）
     */
    private void sendOtp(
            String codePrefix,
            String ratePrefix,
            String attemptPrefix,
            String phone,
            String clientIp,
            UnaryOperator<String> text) {
        // 1. 限流检查：IP 维度（OTP-06）+ 单 IP 每日不同手机号数（防横扫轰炸）
        if (RateLimiter.exceeded(redis, KEY_IP_RATE + clientIp, IP_RATE_MAX, Duration.ofMinutes(1))) {
            throw new BusinessException(429, "SMS_RATE_LIMIT", "发送过于频繁，请稍后再试");
        }
        enforceDistinctPhonesPerIp(clientIp, phone);

        // 2. 限流检查：60s 重发间隔 + 每日上限（INCR 原子操作消除 TOCTOU 竞争）
        String rateKey = ratePrefix + phone;
        if (Boolean.TRUE.equals(redis.hasKey(rateKey))) {
            throw new BusinessException(429, "SMS_RATE_LIMIT", "发送过于频繁，请稍后再试");
        }
        if (RateLimiter.exceeded(redis, KEY_DAILY + phone, DAILY_LIMIT, Duration.ofDays(1))) {
            throw new BusinessException(429, "SMS_DAILY_LIMIT", "今日验证码已达上限");
        }

        // 3. 生成 6 位验证码，存 HMAC 摘要（pepper 在应用配置，拖库不可离线枚举）
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        redis.opsForValue()
                .set(codePrefix + phone, secretHasher.hash(phone + ":" + code), Duration.ofMinutes(CODE_TTL));

        // 4. 写频控标记，重发后清旧尝试计数（UX-03：重发即给全新 5 次机会）
        redis.opsForValue().set(rateKey, "1", Duration.ofSeconds(RATE_TTL));
        redis.delete(attemptPrefix + phone);

        // 5. 发送
        smsChannel.sendCode(phone, text.apply(code));
    }

    /**
     * OTP 校验通用路径：尝试上限检查 → 哈希比对 → 成功才消费。登录与重置两套验证码只有 key 前缀不同，防线完全相同。
     *
     * <p>错误不烧码：错满 MAX_ATTEMPTS 次才作废，之前验证码保留供用户更正重输（手滑友好）；
     * 猜测空间被封顶为 10^6 中至多 5 次，无需在验证接口另设限流。读-比对-删非原子，
     * 并发同码双过的窗口收益极小，接受。
     */
    private void consumeOtp(String codePrefix, String attemptPrefix, String phone, String code) {
        // 1. 取哈希并检查尝试次数：无哈希 = 未发/已过期（不计数，防刷计数器）；错满上限则作废重发（OTP-07）
        String codeKey = codePrefix + phone;
        String attemptKey = attemptPrefix + phone;
        String storedHash = redis.opsForValue().get(codeKey);
        if (storedHash == null) {
            throw new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期");
        }
        String attemptStr = redis.opsForValue().get(attemptKey);
        int attempts = attemptStr != null ? Integer.parseInt(attemptStr) : 0;
        if (attempts >= MAX_ATTEMPTS) {
            redis.delete(codeKey);
            throw new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期，请重新发送");
        }

        // 2. 开发环境固定码优先放行（DevSmsChannel 不存在时跳过）
        DevSmsChannel dev = devSmsChannelProvider.getIfAvailable();
        if (dev != null && dev.getDevCode().equals(code)) {
            redis.delete(attemptKey);
            return;
        }

        // 3. 哈希比对：存储的是 HMAC-SHA256(pepper, phone:code)，拖库也无法离线枚举低熵验证码
        if (!secretHasher.hash(phone + ":" + code).equals(storedHash)) {
            Long hits = redis.opsForValue().increment(attemptKey);
            redis.expire(attemptKey, Duration.ofMinutes(CODE_TTL));
            if (hits != null && hits >= MAX_ATTEMPTS) {
                redis.delete(codeKey); // 第 5 次错误即焚，后续输入直接走「已过期」
            }
            throw new BusinessException(400, "SMS_CODE_INVALID", "验证码错误");
        }

        // 4. 校验通过：消费验证码 + 清除尝试计数
        redis.delete(codeKey);
        redis.delete(attemptKey);
    }

    /**
     * 单 IP 每日不同手机号数上限：验证码发送是未认证端点（手机号由请求方自报），
     * IP+每号频控挡不住「一个 IP 横扫大量不同号码」的轰炸——每号都只发一条、不触发日限，
     * 但累计成本由攻击者用单个 IP 撬动。这里按 IP 维护去重号码集合，超过上限的「新号码」
     * 拒绝发送；已见过的号码不受影响（复发仍交由 60s/日限兜底）。
     *
     * <p>SADD 原子返回是否新增：仅新增成员导致总数超限才拦截，避免误伤对既有号码的重复发送。
     */
    private void enforceDistinctPhonesPerIp(String clientIp, String phone) {
        String key = "sms:ip:phones:" + clientIp;
        Long added = redis.opsForSet().add(key, phone);
        if (added != null && added == 1L) {
            redis.expire(key, Duration.ofDays(1));
            Long size = redis.opsForSet().size(key);
            if (size != null && size > IP_DISTINCT_PHONES_MAX) {
                throw new BusinessException(429, "SMS_RATE_LIMIT", "发送过于频繁，请稍后再试");
            }
        }
    }
}
