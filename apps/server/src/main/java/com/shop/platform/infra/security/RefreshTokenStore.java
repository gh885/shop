package com.shop.platform.infra.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

/**
 * Opaque refresh token 的 Redis 存储与轮换机制：签发（哈希落库 + 设备索引）、单次消费（getAndDelete = rotation）、
 * 重放检测、设备级/全量吊销。
 *
 * <p>auth（用户）与 admin（员工）共用同一套机制，subject 由调用方决定（userId / staffId），本类不感知业务实体。
 */
@Component
@RequiredArgsConstructor
public class RefreshTokenStore {

    private static final String KEY_REFRESH = "refresh:"; // refresh:<sha256> → subjectId
    private static final String KEY_USER_DEVICE = "refresh:user:"; // refresh:user:<subjectId>:<deviceId> → sha256
    private static final String KEY_CONSUMED = "refresh:consumed:"; // refresh:consumed:<sha256> → subjectId (replay)
    private static final long REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000L; // 7 天

    private final StringRedisTemplate redis;

    /** 签发：存 SHA-256 哈希（不落明文）+ 设备索引（按 deviceId 管理） */
    public void issue(String subjectId, String deviceId, String hash) {
        redis.opsForValue().set(KEY_REFRESH + hash, subjectId, Duration.ofMillis(REFRESH_TTL_MS));
        redis.opsForValue().set(KEY_USER_DEVICE + subjectId + ":" + deviceId, hash, Duration.ofMillis(REFRESH_TTL_MS));
    }

    /** 消费旧 token（getAndDelete = 一次性）；返回 null 表示无效或已被消费 */
    public String consume(String hash) {
        return redis.opsForValue().getAndDelete(KEY_REFRESH + hash);
    }

    /** 查询是否已被消费过（重放检测用） */
    public String consumedSubject(String hash) {
        return redis.opsForValue().get(KEY_CONSUMED + hash);
    }

    /** 标记已消费（短 TTL 窗口，供重放检测识别） */
    public void markConsumed(String hash, String subjectId) {
        redis.opsForValue().set(KEY_CONSUMED + hash, subjectId, Duration.ofMinutes(30));
    }

    /** 删除指定设备的 refresh token（登出 / 刷新前清理旧设备索引） */
    public void revokeDevice(String subjectId, String deviceId) {
        String idxKey = KEY_USER_DEVICE + subjectId + ":" + deviceId;
        String storedHash = redis.opsForValue().getAndDelete(idxKey);
        if (storedHash != null) {
            redis.delete(KEY_REFRESH + storedHash);
        }
    }

    /** 吊销某主体所有设备的 refresh token（改密 / 重放攻击兜底） */
    public void revokeAll(String subjectId) {
        String pattern = KEY_USER_DEVICE + subjectId + ":*";
        Set<String> keys = redis.keys(pattern);
        if (keys == null || keys.isEmpty()) return;

        List<String> hashes = redis.opsForValue().multiGet(keys);
        redis.delete(keys);
        List<String> refreshKeys = hashes.stream()
                .filter(Objects::nonNull)
                .map(h -> KEY_REFRESH + h)
                .toList();
        if (!refreshKeys.isEmpty()) {
            redis.delete(refreshKeys);
        }
    }

    /** SHA-256 hex。refresh token 只存哈希不落明文（MAINT-01/02） */
    public static String sha256Hex(String input) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
