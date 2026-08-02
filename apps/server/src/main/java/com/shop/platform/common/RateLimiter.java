package com.shop.platform.common;

import java.time.Duration;
import lombok.NoArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;

/** 基于 Redis INCR + EXPIRE 的滑动窗口限流。 */
@NoArgsConstructor
public final class RateLimiter {

    /** INCR 后设为指定时长过期（仅在首次 INCR 时设置），超过 max 返回 true。 */
    public static boolean exceeded(StringRedisTemplate redis, String key, int max, Duration window) {
        Long count = redis.opsForValue().increment(key);
        if (count == 1) {
            redis.expire(key, window);
        }
        return count != null && count > max;
    }
}
