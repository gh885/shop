package com.shop.platform.audit.mapper;

import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 审计表的 SQL 只在这里。按 module-map 第 8.4 节，模块内部的数据访问住 {@code mapper/}——
 * 也只有这个包允许出现原生 SQL（见 {@code ArchitectureTest}）。
 */
@Component
public class AuditLogStore {

    private static final String INSERT =
            """
            INSERT INTO audit.audit_log
                (action, object_type, object_id, operator_type, operator_id, merchant_id, changes, result, trace_id)
            VALUES (:action, :objectType, :objectId, :operatorType, :operatorId, :merchantId,
                    CAST(:changes AS jsonb), :result, :traceId)
            """;

    private static final String KNOWN_ACTIONS = "SELECT action FROM audit.audit_action";

    private final JdbcClient jdbc;

    public AuditLogStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public List<String> knownActions() {
        return jdbc.sql(KNOWN_ACTIONS).query(String.class).list();
    }

    public void append(
            String action,
            String objectType,
            String objectId,
            String operatorType,
            UUID operatorId,
            UUID merchantId,
            String changesJson,
            String result,
            String traceId) {
        jdbc.sql(INSERT)
                .param("action", action)
                .param("objectType", objectType)
                .param("objectId", objectId)
                .param("operatorType", operatorType)
                .param("operatorId", operatorId)
                .param("merchantId", merchantId)
                .param("changes", changesJson)
                .param("result", result)
                .param("traceId", traceId)
                .update();
    }
}
