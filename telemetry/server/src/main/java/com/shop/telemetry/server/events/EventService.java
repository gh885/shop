package com.shop.telemetry.server.events;

import com.shop.telemetry.server.store.EventQuery;
import com.shop.telemetry.server.store.EventStore;
import com.shop.telemetry.server.store.StoredEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * 事件读路径。和 {@code issues} 分开的理由：这里是点查大对象，不参与列表分页。
 */
@Component
public class EventService {

    private static final int MAX_LIMIT = 100;

    private final EventStore store;

    EventService(EventStore store) {
        this.store = store;
    }

    public List<StoredEvent> byIssue(String projectId, Long issueId, int limit, Duration window) {
        Instant to = Instant.now();
        return store.search(new EventQuery(
                projectId, to.minus(window), to.plusSeconds(60), issueId, Math.clamp(limit, 1, MAX_LIMIT)));
    }

    public List<StoredEvent> recent(String projectId, int limit, Duration window) {
        return byIssue(projectId, null, limit, window);
    }
}
