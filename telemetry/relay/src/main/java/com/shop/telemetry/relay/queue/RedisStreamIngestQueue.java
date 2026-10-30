package com.shop.telemetry.relay.queue;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.stereotype.Component;

/**
 * 每个 kind 一条 stream（{@code telemetry:ingest:event} 等），worker 按 kind 起消费组。
 *
 * <p>未做 MAXLEN 修剪：修剪策略要和配额（M2）一起定——按 kind 分档而不是一刀切，
 * 否则事件被限流掉了而 session 还在灌。M0 先保证链路通。
 */
@Component
public class RedisStreamIngestQueue implements IngestQueue {

    private static final String STREAM_PREFIX = "telemetry:ingest:";

    private final StringRedisTemplate template;

    public RedisStreamIngestQueue(StringRedisTemplate template) {
        this.template = template;
    }

    @Override
    public void push(String projectId, String kind, String payload) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("projectId", projectId);
        fields.put("kind", kind);
        fields.put("receivedAt", String.valueOf(System.currentTimeMillis()));
        fields.put("payload", payload);
        template.opsForStream().add(StreamRecords.string(fields).withStreamKey(STREAM_PREFIX + kind));
    }
}
