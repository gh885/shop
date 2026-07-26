package com.shop.platform.auth.service;

import static com.shop.platform.auth.service.AuthHashes.sha256Hex;

import com.shop.platform.auth.infra.DevSmsChannel;
import com.shop.platform.auth.infra.SmsChannel;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;

@Service
@RequiredArgsConstructor
public class SmsCodeService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final String KEY_CODE = "sms:code:";
    private static final String KEY_RATE = "sms:rate:";
    private static final String KEY_DAILY = "sms:daily:";
    private static final String KEY_ATTEMPT = "sms:attempt:";
    private static final String KEY_IP_RATE = "sms:ip:";

    private static final long CODE_TTL = 5;          // 验证码有效 5 分钟
    private static final long RATE_TTL = 60;         // 重发间隔 60 秒
    private static final int DAILY_LIMIT = 20;        // 每手机号每日上限
    private static final int IP_RATE_MAX = 10;        // 每 IP 每分钟上限
    private static final int MAX_ATTEMPTS = 5;        // 最大尝试次数

    private final StringRedisTemplate redis;
    private final SmsChannel smsChannel;
    private final ObjectProvider<DevSmsChannel> devSmsChannelProvider;

    /** 发送验证码 */
    public void sendCode(String phone, String clientIp) {
        // IP 维度限流（OTP-06）
        String ipRateKey = KEY_IP_RATE + clientIp;
        Long ipCount = redis.opsForValue().increment(ipRateKey);
        if (ipCount == 1) {
            redis.expire(ipRateKey, Duration.ofSeconds(60));
        }
        if (ipCount > IP_RATE_MAX) {
            throw new BusinessException(429, ErrorCodes.SMS_RATE_LIMIT, "发送过于频繁，请稍后再试");
        }

        // 60s 重发间隔检查
        String rateKey = KEY_RATE + phone;
        if (Boolean.TRUE.equals(redis.hasKey(rateKey))) {
            throw new BusinessException(429, ErrorCodes.SMS_RATE_LIMIT, "发送过于频繁，请稍后再试");
        }

        // 每日上限检查：用 increment 原子操作，消除 TOCTOU 竞争
        String dailyKey = KEY_DAILY + phone;
        Long dailyCount = redis.opsForValue().increment(dailyKey);
        if (dailyCount == 1) {
            redis.expire(dailyKey, Duration.ofDays(1));
        }
        if (dailyCount > DAILY_LIMIT) {
            throw new BusinessException(429, ErrorCodes.SMS_DAILY_LIMIT, "今日验证码已达上限");
        }

        // 生成 6 位验证码
        String code = String.format("%06d", SECURE_RANDOM.nextInt(1_000_000));

        // OTP-04: 存 SHA-256(手机号 + ":" + code) 而非明文
        String codeHash = sha256Hex(phone + ":" + code);
        String codeKey = KEY_CODE + phone;
        redis.opsForValue().set(codeKey, codeHash, Duration.ofMinutes(CODE_TTL));

        // 频率控制
        redis.opsForValue().set(rateKey, "1", Duration.ofSeconds(RATE_TTL));

        // UX-03: 重发后清除旧尝试计数
        redis.delete(KEY_ATTEMPT + phone);

        // 发送
        smsChannel.sendCode(phone, code);
    }

    /** 校验验证码 */
    public void verifyCode(String phone, String code) {
        // OTP-07: 尝试次数检查
        String attemptKey = KEY_ATTEMPT + phone;
        String attemptStr = redis.opsForValue().get(attemptKey);
        int attempts = attemptStr != null ? Integer.parseInt(attemptStr) : 0;
        if (attempts >= MAX_ATTEMPTS) {
            // 超过最大尝试次数，删除当前验证码，要求重新发送
            redis.delete(KEY_CODE + phone);
            throw new BusinessException(400, ErrorCodes.SMS_CODE_EXPIRED, "验证码已过期，请重新发送");
        }

        // OTP-04: 比对哈希
        String codeKey = KEY_CODE + phone;
        String storedHash = redis.opsForValue().getAndDelete(codeKey);
        if (storedHash == null) {
            // 开发环境用固定码兜底（DevSmsChannel 不存在时跳过）
            DevSmsChannel dev = devSmsChannelProvider.getIfAvailable();
            if (dev != null && dev.getDevCode().equals(code)) {
                redis.delete(attemptKey);
                return;
            }
            throw new BusinessException(400, ErrorCodes.SMS_CODE_EXPIRED, "验证码已过期");
        }

        String computedHash = sha256Hex(phone + ":" + code);
        if (!computedHash.equals(storedHash)) {
            // 失败计数递增
            redis.opsForValue().increment(attemptKey);
            redis.expire(attemptKey, Duration.ofMinutes(CODE_TTL));
            throw new BusinessException(400, ErrorCodes.SMS_CODE_INVALID, "验证码错误");
        }

        // 校验通过，清除尝试计数
        redis.delete(attemptKey);
    }
}
