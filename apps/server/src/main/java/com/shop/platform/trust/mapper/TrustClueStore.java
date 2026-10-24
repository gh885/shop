package com.shop.platform.trust.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * {@code trust.violation_clue} 的读写。线索是流水，只增不改——
 * 状态推进（acknowledged / dismissed）是运营动作，走条件更新。
 */
@Component
public class TrustClueStore {

    /** 不带冲突目标：任何唯一键冲突（uq_clue_order）都当"来过了"。 */
    private static final String INSERT =
            """
            INSERT INTO trust.violation_clue (id, kind, merchant_id, seller_order_id, occurred_at, detail)
            VALUES (:id, :kind, :merchantId, :sellerOrderId, :occurredAt, :detail)
            ON CONFLICT DO NOTHING
            """;

    private static final String FIND =
            """
            SELECT id, kind, merchant_id, seller_order_id, occurred_at, detail, status, created_at
              FROM trust.violation_clue
             WHERE (:status::text IS NULL OR status = :status)
             ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at DESC
             LIMIT :limit
            """;

    private static final RowMapper<ClueRow> MAPPER = RowMappers.of(ClueRow.class);

    private final JdbcClient jdbc;

    public TrustClueStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public void insert(UUID id, String kind, UUID merchantId, UUID sellerOrderId, Instant occurredAt, String detail) {
        jdbc.sql(INSERT)
                .param("id", id)
                .param("kind", kind)
                .param("merchantId", merchantId)
                .param("sellerOrderId", sellerOrderId)
                .param("occurredAt", RowMappers.toDb(occurredAt))
                .param("detail", detail)
                .update();
    }

    /** 待处理（open）在前，其余按时间倒序——盯告警的人先看最要紧的。 */
    public List<ClueRow> find(String status, int limit) {
        return jdbc.sql(FIND)
                .param("status", status)
                .param("limit", limit)
                .query(MAPPER)
                .list();
    }

    public record ClueRow(
            UUID id,
            String kind,
            UUID merchantId,
            UUID sellerOrderId,
            Instant occurredAt,
            String detail,
            String status,
            Instant createdAt) {}
}
