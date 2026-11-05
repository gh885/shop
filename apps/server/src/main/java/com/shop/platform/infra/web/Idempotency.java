package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.db.JsonColumns;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * 写操作的幂等执行器：{@code Idempotency-Key} 头 + Redis 存首次结果。
 *
 * <p>解决的是同一个问题：客户端超时重试时，拿不回"上次那次"的结果——
 * 状态机 CAS 能保证不错，但重试只会得到一个 409，前端只能弹"操作失败"。
 * 带上幂等键，重试原样返回第一次的响应。
 *
 * <p>三条口径：
 *
 * <ul>
 *   <li><b>只缓存成功。</b> action 抛异常就不记录——失败让客户端重试是正确的，
 *       缓存失败会把"第一次没做成的"永久钉死成失败
 *   <li><b>处理中回 409。</b> 结果还没落 Redis 时第二个同键请求到达，回
 *       {@code IDEMPOTENCY_IN_PROGRESS} 让客户端稍后重试，而不是并发执行两次
 *   <li><b>键按调用方隔离。</b> scope 里必须带操作者身份——不然知道别人 key 的
 *       请求能"领走"别人的结果（信息泄露），或者抢先占位把别人锁在外面
 * </ul>
 *
 * <p>是 bean 而不是静态工具：调用方依赖「幂等」这个概念，不依赖 Redis 连接——
 * Redis 的获取方式是 infra 的实现细节，不该渗进 controller。
 */
@Component
public class Idempotency {

    /** 结果留 24 小时：跨天重试同一笔支付没有意义，键自然过期。 */
    private static final Duration RESULT_TTL = Duration.ofHours(24);

    /** 处理锁比一次请求的长得多（客户端超时常见 30s），但远短于结果 TTL。 */
    private static final Duration LOCK_TTL = Duration.ofSeconds(90);

    private static final int MAX_KEY_LENGTH = 200;

    private final StringRedisTemplate redis;

    public Idempotency(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * 幂等执行。{@code key} 为 null/空白 = 客户端没带键，直接执行（不强求所有客户端都带）。
     *
     * @param scope 调用方身份域，必须带操作者 id（如 {@code "pay:" + buyerId}），
     *     同一个键在不同 scope 下互不相干
     */
    public <T> ResponseEntity<T> execute(String scope, String key, Class<T> type, Supplier<T> action) {
        if (key == null || key.isBlank()) {
            return ResponseEntity.ok(action.get());
        }
        if (key.length() > MAX_KEY_LENGTH) {
            throw BusinessException.badRequest("Idempotency-Key 过长，上限 " + MAX_KEY_LENGTH + " 字符");
        }

        String resultKey = "idem:" + scope + ":" + key;
        String lockKey = "idem:lock:" + scope + ":" + key;

        String recorded = redis.opsForValue().get(resultKey);
        if (recorded != null) {
            return ResponseEntity.ok(JsonColumns.read(recorded, type));
        }

        Boolean claimed = redis.opsForValue().setIfAbsent(lockKey, "1", LOCK_TTL);
        if (!Boolean.TRUE.equals(claimed)) {
            throw BusinessException.conflict(ErrorCodes.IDEMPOTENCY_IN_PROGRESS, "同键请求正在处理中，请稍后原样重试");
        }

        boolean done = false;
        try {
            T result = action.get();
            redis.opsForValue().set(resultKey, JsonColumns.write(result), RESULT_TTL);
            done = true;
            return ResponseEntity.ok(result);
        } finally {
            if (!done) {
                // 失败不缓存：释放锁让客户端重试，结果等重试成功再记
                redis.delete(lockKey);
            }
        }
    }
}
