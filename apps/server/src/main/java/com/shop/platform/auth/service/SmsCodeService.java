package com.shop.platform.auth.service;

import static com.shop.platform.auth.service.AuthHashes.sha256Hex;

import com.shop.platform.auth.infra.DevSmsChannel;
import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.RateLimiter;
import java.security.SecureRandom;
import java.time.Duration;
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

    private static final long CODE_TTL = 5; // 验证码有效 5 分钟
    private static final long RATE_TTL = 60; // 重发间隔 60 秒
    private static final int DAILY_LIMIT = 20; // 每手机号每日上限
    private static final int IP_RATE_MAX = 10; // 每 IP 每分钟上限
    private static final int MAX_ATTEMPTS = 5; // 最大尝试次数

    private final StringRedisTemplate redis;
    private final SmsChannel smsChannel;
    private final ObjectProvider<DevSmsChannel> devSmsChannelProvider;

    /** 发送验证码 */
    public void sendCode(String phone, String clientIp) {
        // 1. 限流检查：IP 维度（OTP-06）
        if (RateLimiter.exceeded(redis, KEY_IP_RATE + clientIp, IP_RATE_MAX, Duration.ofMinutes(1))) {
            throw new BusinessException(429, "SMS_RATE_LIMIT", "发送过于频繁，请稍后再试");
        }

        // 2. 限流检查：60s 重发间隔 + 每日上限（INCR 原子操作消除 TOCTOU 竞争）
        String rateKey = KEY_RATE + phone;
        if (Boolean.TRUE.equals(redis.hasKey(rateKey))) {
            throw new BusinessException(429, "SMS_RATE_LIMIT", "发送过于频繁，请稍后再试");
        }
        if (RateLimiter.exceeded(redis, KEY_DAILY + phone, DAILY_LIMIT, Duration.ofDays(1))) {
            throw new BusinessException(429, "SMS_DAILY_LIMIT", "今日验证码已达上限");
        }

        // 3. 生成 6 位验证码，存 SHA-256(手机号 + ":" + code) 哈希（OTP-04）
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));
        String codeHash = sha256Hex(phone + ":" + code);
        String codeKey = KEY_CODE + phone;
        redis.opsForValue().set(codeKey, codeHash, Duration.ofMinutes(CODE_TTL));

        // 4. 写频控标记，重发后清旧尝试计数（UX-03）
        redis.opsForValue().set(rateKey, "1", Duration.ofSeconds(RATE_TTL));
        redis.delete(KEY_ATTEMPT + phone);

        // 5. 发送
        smsChannel.sendCode(phone, code);
    }

    /** 校验验证码 */
    public void verifyCode(String phone, String code) {
        // 1. 尝试次数检查：超上限则作废验证码、要求重发（OTP-07）
        String attemptKey = KEY_ATTEMPT + phone;
        String attemptStr = redis.opsForValue().get(attemptKey);
        int attempts = attemptStr != null ? Integer.parseInt(attemptStr) : 0;
        if (attempts >= MAX_ATTEMPTS) {
            redis.delete(KEY_CODE + phone);
            throw new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期，请重新发送");
        }

        // 2. 取走存储的验证码哈希（getAndDelete = 一次性消费，OTP-04）
        String codeKey = KEY_CODE + phone;
        String storedHash = redis.opsForValue().getAndDelete(codeKey);

        // 3. 开发环境固定码优先放行（DevSmsChannel 不存在时跳过）
        DevSmsChannel dev = devSmsChannelProvider.getIfAvailable();
        if (dev != null && dev.getDevCode().equals(code)) {
            redis.delete(attemptKey);
            return;
        }

        // 4. 比对哈希：过期或错误（错误时失败计数递增）
        if (storedHash == null) {
            throw new BusinessException(400, "SMS_CODE_EXPIRED", "验证码已过期");
        }
        String computedHash = sha256Hex(phone + ":" + code);
        if (!computedHash.equals(storedHash)) {
            redis.opsForValue().increment(attemptKey);
            redis.expire(attemptKey, Duration.ofMinutes(CODE_TTL));
            throw new BusinessException(400, "SMS_CODE_INVALID", "验证码错误");
        }

        // 5. 校验通过，清除尝试计数
        redis.delete(attemptKey);
    }
}
