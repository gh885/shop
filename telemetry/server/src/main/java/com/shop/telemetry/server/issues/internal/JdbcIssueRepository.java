package com.shop.telemetry.server.issues.internal;

import com.shop.telemetry.server.issues.IssueEvent;
import com.shop.telemetry.server.issues.IssueSummary;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * issue 的读写。分组算法的产物只能落在这里，所以 upsert 的每条更新子句都要能回答
 * "重复投递会不会算错一次"。
 */
@Component
public class JdbcIssueRepository {

    private static final String SELECT_COLUMNS =
            """
            id, title, culprit, level, status, first_seen, last_seen, event_count,
            release_first, release_last, tenant_id
            """;

    private final JdbcClient jdbc;

    public JdbcIssueRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 建或更新一条 issue，返回 id。
     *
     * <p>调用方保证"只在 event 首次插入成功时才调它"——{@code event_count + 1} 不能自己判断
     * 重复，否则 at-least-once 的重投会把计数刷高。
     *
     * <p>{@code first_seen = LEAST(...)} / {@code last_seen = GREATEST(...)} 而不是直接覆盖：
     * 事件到达顺序不受控（重投、时钟漂移），覆盖会让"首次出现"往后漂。
     */
    public long upsert(IssueEvent event) {
        return jdbc.sql(
                        """
                        INSERT INTO telemetry.issue
                            (project_id, fingerprint, title, culprit, level, first_seen, last_seen,
                             event_count, release_first, release_last, tenant_id)
                        VALUES
                            (:projectId, :fingerprint, :title, :culprit, :level, :occurredAt, :occurredAt,
                             1, :release, :release, :tenantId)
                        ON CONFLICT (project_id, fingerprint) DO UPDATE SET
                            last_seen     = GREATEST(telemetry.issue.last_seen, EXCLUDED.last_seen),
                            first_seen    = LEAST(telemetry.issue.first_seen, EXCLUDED.first_seen),
                            event_count   = telemetry.issue.event_count + 1,
                            release_last  = COALESCE(EXCLUDED.release_last, telemetry.issue.release_last),
                            title         = CASE WHEN telemetry.issue.title = '' THEN EXCLUDED.title
                                                 ELSE telemetry.issue.title END
                        RETURNING id
                        """)
                .param("projectId", event.projectId())
                .param("fingerprint", event.fingerprint())
                .param("title", event.title())
                .param("culprit", event.culprit())
                .param("level", event.level())
                .param("occurredAt", OffsetDateTime.ofInstant(event.occurredAt(), java.time.ZoneOffset.UTC))
                .param("release", event.release())
                .param("tenantId", event.tenantId())
                .query(Long.class)
                .single();
    }

    public List<IssueSummary> list(String projectId, int limit) {
        return jdbc.sql("SELECT " + SELECT_COLUMNS
                        + " FROM telemetry.issue WHERE project_id = :p ORDER BY last_seen DESC LIMIT :limit")
                .param("p", projectId)
                .param("limit", limit)
                .query(JdbcIssueRepository::map)
                .list();
    }

    public Optional<IssueSummary> find(String projectId, long id) {
        return jdbc.sql("SELECT " + SELECT_COLUMNS + " FROM telemetry.issue WHERE project_id = :p AND id = :id")
                .param("p", projectId)
                .param("id", id)
                .query(JdbcIssueRepository::map)
                .optional();
    }

    private static IssueSummary map(ResultSet rs, int rowNum) throws SQLException {
        return new IssueSummary(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("culprit"),
                rs.getString("level"),
                rs.getString("status"),
                instant(rs, "first_seen"),
                instant(rs, "last_seen"),
                rs.getLong("event_count"),
                rs.getString("release_first"),
                rs.getString("release_last"),
                rs.getString("tenant_id"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        return rs.getObject(column, OffsetDateTime.class).toInstant();
    }
}
