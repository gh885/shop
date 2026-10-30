package com.shop.telemetry.server.events.web;

import com.shop.telemetry.server.events.EventDetail;
import com.shop.telemetry.server.events.EventService;
import com.shop.telemetry.server.store.EventRecord;
import com.shop.telemetry.server.store.EventStore;
import com.shop.telemetry.server.store.StoredEvent;
import com.shop.telemetry.server.symbolication.StackReader;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 事件详情与"某条 issue 的代表样本"。
 *
 * <p>payload 原样返回（不裁剪、不重排）：详情页要能显示客户端发的样子，
 * 而"可读栈"是 M1 符号化后另存的字段，不能覆盖这里。
 */
@RestController
@Profile({"api", "all"})
class EventController {

    /** 列表默认只看最近 14 天：无界扫描是自建平台最常见的自伤方式。 */
    private static final Duration DEFAULT_WINDOW = Duration.ofDays(14);

    private final EventService events;
    private final EventStore store;
    private final JsonMapper json;
    private final StackReader stackReader;

    EventController(EventService events, EventStore store, JsonMapper json, StackReader stackReader) {
        this.events = events;
        this.store = store;
        this.json = json;
        this.stackReader = stackReader;
    }

    @GetMapping("/api/{projectId}/events")
    List<EventDetail> list(
            @PathVariable String projectId,
            @RequestParam(name = "issueId", required = false) Long issueId,
            @RequestParam(name = "limit", defaultValue = "20") int limit) {
        return events.byIssue(projectId, issueId, limit, DEFAULT_WINDOW).stream()
                .map(this::toDetail)
                .toList();
    }

    @GetMapping("/api/{projectId}/events/{eventId}")
    ResponseEntity<Object> find(@PathVariable String projectId, @PathVariable String eventId) {
        return store.get(projectId, eventId)
                .<ResponseEntity<Object>>map(stored -> ResponseEntity.ok(toDetail(stored)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "event not found")));
    }

    private EventDetail toDetail(StoredEvent stored) {
        EventRecord event = stored.event();
        JsonNode payload = json.readTree(event.payload());
        return new EventDetail(
                stored.id(),
                event.eventId(),
                stored.receivedAt(),
                event.occurredAt(),
                stored.issueId(),
                event.kind(),
                event.level(),
                event.platform(),
                event.release(),
                event.environment(),
                event.transaction(),
                event.tenantId(),
                event.traceId(),
                event.spanId(),
                payload,
                stackReader.read(event.projectId(), payload));
    }
}
