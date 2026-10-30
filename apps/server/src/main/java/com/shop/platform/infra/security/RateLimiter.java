package com.shop.platform.infra.security;

import java.time.Duration;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/**
 * 基于 Redis 固定窗口计数的限流。
 *
 * <p>INCR 与首次 EXPIRE 用 Lua 原子执行：两步分离时若进程在 INCR 后、EXPIRE 前崩溃，
 * 会留下永不过期的计数键，该 IP/手机号将被永久限流直到手工清理。窗口从首次访问起算（固定窗口，非滑动）。
 *
 * <p>是 bean 而不是静态工具：调用方依赖「限流」这个概念，不依赖 Redis 连接——
 * Redis 的获取方式是 infra 的实现细节，不该渗进 controller/service。
 */
@Component
public class RateLimiter {

    private static final DefaultRedisScript<Long> INCR_WITH_TTL = new DefaultRedisScript<>(
            """
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return count
            """,
            Long.class);

    private final StringRedisTemplate redis;

    public RateLimiter(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /** 窗口内自增计数，超过 max 返回 true */
    public boolean exceeded(String key, int max, Duration window) {
        Long count = redis.execute(INCR_WITH_TTL, List.of(key), String.valueOf(window.toSeconds()));
        return count != null && count > max;
    }
}
