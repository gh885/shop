package com.shop.telemetry.server.trace;

import com.shop.telemetry.server.store.EventStore;
import com.shop.telemetry.server.store.StoredEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * trace 的读入口。
 *
 * <p>内部链路（SSR → 后端 → 下游）一条 trace 通常只有个位数到几十个事件；上限给到 500 是给
 * "浏览器一次 pageload 里几百个 span"留余量，同时挡住"同一 trace_id 被灌了十万条"的情况。
 */
@Component
public class TraceService {

    /** 窗口是必须的：trace_id 由客户端生成，可以永远复用同一个，不给窗口就等于无界扫描。 */
    private static final Duration WINDOW = Duration.ofDays(30);

    private static final int MAX_EVENTS = 500;

    private final EventStore store;
    private final TraceTreeBuilder builder;

    TraceService(EventStore store, TraceTreeBuilder builder) {
        this.store = store;
        this.builder = builder;
    }

    public Optional<TraceGraph> find(String projectId, String traceId) {
        List<StoredEvent> events = store.byTrace(projectId, traceId, Instant.now().minus(WINDOW), MAX_EVENTS);
        return events.isEmpty() ? Optional.empty() : Optional.of(builder.build(traceId, events));
    }
}
