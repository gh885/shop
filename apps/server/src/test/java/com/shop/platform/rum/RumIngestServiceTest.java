package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.shop.platform.rum.service.RumEventPublisher;
import com.shop.platform.rum.service.RumIngestService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import tools.jackson.databind.ObjectMapper;

/**
 * 接收端的**限流与投递**这两步——它们是接口测试够不到的那一半（走 HTTP 就得真起 Redis
 * 才能造出「限流命中」与「Redis 挂了」两个场景）。
 *
 * <p>这里钉的是 fail-open 那条：**限流查询失败一律放行**。写反了就是「监控设施一挂，
 * 遥测也一起停」——最需要现场的时候把现场关掉，而且它静默。
 *
 * <p>限流走的是 `RateLimiter` 的 Lua 脚本（`redis.execute`），不是 `opsForValue()`：
 * INCR 与首次 EXPIRE 必须原子，stub 打错地方会让这些用例**全部假绿**（没 stub 的 mock
 * 返回 null，脚本「计数为 0」，看起来一切正常）。
 */
class RumIngestServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);
    private final RumEventPublisher publisher = mock(RumEventPublisher.class);

    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final RumIngestService service = new RumIngestService(mapper, redis, publisher, new RumCounters(registry));

    @SuppressWarnings("unchecked")
    private void 窗口内计数为(long count) {
        when(redis.execute(any(RedisScript.class), anyList(), any())).thenReturn(count);
    }

    @Test
    void 正常一批_逐条投递_键是白名单里的app() {
        service.ingest("[{\"kind\":\"error\",\"app\":\"seller\",\"name\":\"js_error\"}]", "1.2.3.4");

        verify(publisher).publish(eq("seller"), anyString());
    }

    @Test
    void 投递的是单条事件的JSON_而非整批原文() {
        service.ingest("[{\"kind\":\"route\",\"app\":\"web\"}]", "1.2.3.4");

        verify(publisher).publish("web", "{\"kind\":\"route\",\"app\":\"web\"}");
    }

    @Test
    void 窗口内超上限_整批不投() {
        窗口内计数为(RumVocabulary.RATE_MAX_PER_MINUTE + 1L);

        service.ingest("[{\"kind\":\"route\",\"app\":\"web\"}]", "1.2.3.4");

        verify(publisher, never()).publish(anyString(), anyString());
    }

    @Test
    void 恰好到上限时仍放行() {
        窗口内计数为(RumVocabulary.RATE_MAX_PER_MINUTE);

        service.ingest("[{\"kind\":\"route\",\"app\":\"web\"}]", "1.2.3.4");

        verify(publisher).publish(eq("web"), anyString());
    }

    /**
     * 限流查询自己失败（Redis 不可用）时**放行**。不记 rejected 也是刻意的——那是
     * 「客户端违规」的计数，把基础设施故障混进去，那个数就没法用来判断有人在乱发了。
     */
    @Test
    void redis不可用时放行() {
        when(redis.execute(any(RedisScript.class), anyList(), any()))
                .thenThrow(new IllegalStateException("redis down"));

        assertThatCode(() -> service.ingest("[{\"kind\":\"route\",\"app\":\"web\"}]", "1.2.3.4"))
                .doesNotThrowAnyException();
        verify(publisher).publish(eq("web"), anyString());
    }

    /** 没有来源 IP 就没有限流键，也就没有可限的东西 */
    @Test
    void 没有来源IP时不碰限流() {
        service.ingest("[{\"kind\":\"route\",\"app\":\"web\"}]", null);

        verify(publisher).publish(eq("web"), anyString());
        verifyNoInteractions(redis);
    }

    /** 投递口抛错也不能外传：遥测的失败不该变成业务页面的失败 */
    @Test
    void 投递口抛错也不外传() {
        doThrow(new IllegalStateException("kafka down")).when(publisher).publish(anyString(), anyString());

        assertThatCode(() -> service.ingest("[{\"kind\":\"route\",\"app\":\"web\"}]", "1.2.3.4"))
                .doesNotThrowAnyException();
    }

    @Test
    void 空体与null体都算脏数据_不投递也不抛() {
        assertThatCode(() -> service.ingest("", "1.2.3.4")).doesNotThrowAnyException();
        assertThatCode(() -> service.ingest(null, "1.2.3.4")).doesNotThrowAnyException();

        verify(publisher, never()).publish(anyString(), anyString());
    }

    @Test
    void 数组元素不是对象时跳过那一条_其余照投() {
        service.ingest("[7, {\"kind\":\"route\",\"app\":\"web\"}]", "1.2.3.4");

        verify(publisher).publish(eq("web"), anyString());
    }

    @Test
    void 批量超上限整批不投() {
        StringBuilder batch = new StringBuilder("[");
        for (int i = 0; i <= RumVocabulary.MAX_BATCH; i++) {
            batch.append(i == 0 ? "" : ",").append("{\"kind\":\"route\",\"app\":\"web\"}");
        }
        batch.append("]");

        service.ingest(batch.toString(), "1.2.3.4");

        verify(publisher, never()).publish(anyString(), anyString());
    }

    @Test
    void 事件内的app是白名单外时_键折成other() {
        service.ingest("[{\"kind\":\"route\",\"app\":\"not-an-app\"}]", "1.2.3.4");

        verify(publisher).publish(eq("other"), anyString());
    }
}
