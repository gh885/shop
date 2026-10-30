package com.shop.telemetry.server.store.internal;

import com.shop.telemetry.server.store.EventQuery;
import com.shop.telemetry.server.store.EventRecord;
import com.shop.telemetry.server.store.EventStore;
import com.shop.telemetry.server.store.StoredEvent;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * event 表的唯一 SQL 所在。上层只认 {@link EventStore}。
 *
 * <p>所有可空列都用显式 {@link Types} 绑定：JdbcClient 对 {@code null} 无类型信息，
 * 不写会得到 "could not determine data type of parameter"——这类错误只在"release 为空"
 * 的少数事件上出现，本地造数据时很容易漏测。
 */
@Component
class JdbcEventStore implements EventStore {

    private static final String SELECT_COLUMNS =
            """
            id, project_id, event_id, received_at, occurred_at, kind, level, platform, release,
            environment, transaction, tenant_id, trace_id, span_id, issue_id, fingerprint, payload
            """;

    private final JdbcClient jdbc;

    JdbcEventStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public boolean append(EventRecord event) {
        int rows = jdbc.sql(
                        """
                        INSERT INTO telemetry.event
                            (project_id, event_id, occurred_at, kind, level, platform, release, environment,
                             transaction, tenant_id, trace_id, span_id, fingerprint, payload)
                        VALUES
                            (:projectId, :eventId, :occurredAt, :kind, :level, :platform, :release, :environment,
                             :transaction, :tenantId, :traceId, :spanId, :fingerprint, CAST(:payload AS jsonb))
                        ON CONFLICT (project_id, event_id) DO NOTHING
                        """)
                .param("projectId", event.projectId())
                .param("eventId", event.eventId())
                .param("occurredAt", OffsetDateTime.ofInstant(event.occurredAt(), java.time.ZoneOffset.UTC))
                .param("kind", event.kind())
                .param("level", event.level(), Types.VARCHAR)
                .param("platform", event.platform(), Types.VARCHAR)
                .param("release", event.release(), Types.VARCHAR)
                .param("environment", event.environment(), Types.VARCHAR)
                .param("transaction", event.transaction(), Types.VARCHAR)
                .param("tenantId", event.tenantId(), Types.VARCHAR)
                .param("traceId", event.traceId(), Types.VARCHAR)
                .param("spanId", event.spanId(), Types.VARCHAR)
                .param("fingerprint", event.fingerprint(), Types.VARCHAR)
                .param("payload", event.payload())
                .update();
        return rows > 0;
    }

    @Override
    public Optional<StoredEvent> get(String projectId, String eventId) {
        return jdbc.sql("SELECT " + SELECT_COLUMNS + " FROM telemetry.event WHERE project_id = :p AND event_id = :e")
                .param("p", projectId)
                .param("e", eventId)
                .query(JdbcEventStore::map)
                .optional();
    }

    @Override
    public List<StoredEvent> byTrace(String projectId, String traceId, Instant from, int limit) {
        // 按 occurred_at 升序：一条 trace 的"因果顺序"由客户端时钟决定，落库顺序不行
        // （两端时钟有偏差时，redis 到达顺序和真实先后无关）
        return jdbc.sql("SELECT " + SELECT_COLUMNS + """
                         FROM telemetry.event
                        WHERE project_id = :p AND trace_id = :t AND received_at >= :from
                        ORDER BY occurred_at ASC, id ASC LIMIT :limit""")
                .param("p", projectId)
                .param("t", traceId)
                .param("from", OffsetDateTime.ofInstant(from, java.time.ZoneOffset.UTC))
                .param("limit", limit)
                .query(JdbcEventStore::map)
                .list();
    }

    @Override
    public List<StoredEvent> search(EventQuery query) {
        StringBuilder sql = new StringBuilder("SELECT ")
                .append(SELECT_COLUMNS)
                .append(" FROM telemetry.event WHERE project_id = :p")
                .append(" AND received_at >= :from AND received_at < :to");
        if (query.issueId() != null) {
            sql.append(" AND issue_id = :issueId");
        }
        sql.append(" ORDER BY received_at DESC LIMIT :limit");

        var spec = jdbc.sql(sql.toString())
                .param("p", query.projectId())
                .param("from", OffsetDateTime.ofInstant(query.from(), java.time.ZoneOffset.UTC))
                .param("to", OffsetDateTime.ofInstant(query.to(), java.time.ZoneOffset.UTC))
                .param("limit", query.limit());
        if (query.issueId() != null) {
            spec = spec.param("issueId", query.issueId());
        }
        return spec.query(JdbcEventStore::map).list();
    }

    @Override
    public void linkIssue(String projectId, String eventId, long issueId) {
        jdbc.sql("UPDATE telemetry.event SET issue_id = :issueId WHERE project_id = :p AND event_id = :e")
                .param("issueId", issueId)
                .param("p", projectId)
                .param("e", eventId)
                .update();
    }

    private static StoredEvent map(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        EventRecord event = new EventRecord(
                rs.getString("project_id"),
                rs.getString("event_id"),
                instant(rs, "occurred_at"),
                rs.getString("kind"),
                rs.getString("level"),
                rs.getString("platform"),
                rs.getString("release"),
                rs.getString("environment"),
                rs.getString("transaction"),
                rs.getString("tenant_id"),
                rs.getString("trace_id"),
                rs.getString("span_id"),
                rs.getString("fingerprint"),
                rs.getString("payload"));
        return new StoredEvent(rs.getLong("id"), instant(rs, "received_at"), rs.getObject("issue_id", Long.class), event);
    }

    private static Instant instant(java.sql.ResultSet rs, String column) throws java.sql.SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }
}
