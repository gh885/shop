package com.shop.telemetry.server.store.internal;

import com.shop.telemetry.server.store.DropCounter;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 按天聚合，不写明细行：丢弃是高频事件（配额打满时每条都丢），逐条记会把"计数"变成新的事故源。
 */
@Component
class JdbcDropCounter implements DropCounter {

    private final JdbcClient jdbc;

    JdbcDropCounter(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void increment(String projectId, String kind, String reason) {
        jdbc.sql(
                        """
                        INSERT INTO telemetry.dropped (project_id, kind, reason, day, count)
                        VALUES (:p, :kind, :reason, CURRENT_DATE, 1)
                        ON CONFLICT (project_id, kind, reason, day) DO UPDATE
                            SET count = telemetry.dropped.count + 1
                        """)
                .param("p", projectId)
                .param("kind", kind)
                .param("reason", reason)
                .update();
    }
}
