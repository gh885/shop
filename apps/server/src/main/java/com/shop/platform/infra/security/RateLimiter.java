package com.shop.platform.infra.security;

import java.time.Duration;
import java.util.List;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

/**
 * 基于 Redis 固定窗口计数的限流。Redis 适配。
 *
 * <p>原住 {@code account.infra}，注释里写着「目前只有 account 模块（登录/发码）在用 → account.infra；
 * <b>出现第二个消费方再上提到根 infra</b>」。2026-10 前端遥测接收端（{@code rum/service/RumIngestService}）
 * 成了第二个消费方，按那句条件上提到根共享包——不是顺手挪，是兑现一条写下来的触发条件。
 *
 * <p>INCR 与首次 EXPIRE 用 Lua 原子执行：两步分离时若进程在 INCR 后、EXPIRE 前崩溃，
 * 会留下永不过期的计数键，该 IP/手机号将被永久限流直到手工清理。窗口从首次访问起算（固定窗口，非滑动）。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
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
