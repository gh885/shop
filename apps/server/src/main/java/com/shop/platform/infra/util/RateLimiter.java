package com.shop.platform.infra.util;

import java.time.Duration;
import java.util.List;
import lombok.NoArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

/**
 * 基于 Redis 固定窗口计数的限流。Redis 适配，跨模块共享 → 根 infra。
 *
 * <p>INCR 与首次 EXPIRE 用 Lua 原子执行：两步分离时若进程在 INCR 后、EXPIRE 前崩溃，
 * 会留下永不过期的计数键，该 IP/手机号将被永久限流直到手工清理。窗口从首次访问起算（固定窗口，非滑动）。
 */
@NoArgsConstructor
public final class RateLimiter {

    private static final DefaultRedisScript<Long> INCR_WITH_TTL = new DefaultRedisScript<>(
            """
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return count
            """,
            Long.class);

    /** 窗口内自增计数，超过 max 返回 true */
    public static boolean exceeded(StringRedisTemplate redis, String key, int max, Duration window) {
        Long count = redis.execute(INCR_WITH_TTL, List.of(key), String.valueOf(window.toSeconds()));
        return count != null && count > max;
    }
}
