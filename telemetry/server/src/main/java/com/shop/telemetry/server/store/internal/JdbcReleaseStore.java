package com.shop.telemetry.server.store.internal;

import com.shop.telemetry.server.store.ReleaseStore;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
class JdbcReleaseStore implements ReleaseStore {

    private final JdbcClient jdbc;

    JdbcReleaseStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void record(String projectId, String version) {
        jdbc.sql("INSERT INTO telemetry.release (project_id, version) VALUES (:p, :v) ON CONFLICT DO NOTHING")
                .param("p", projectId)
                .param("v", version)
                .update();
    }
}
