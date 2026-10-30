package com.shop.telemetry.server.symbolication.internal;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * sourcemap 的存与取。content 直接存 {@code jsonb}：将来要按 sources 建索引或做"这条 map
 * 覆盖了哪些文件"的反查时，不用改表。
 */
@Component
public class JdbcSourceMapRepository {

    private final JdbcClient jdbc;

    public JdbcSourceMapRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<String> find(String projectId, String debugId) {
        return jdbc.sql(
                        "SELECT content FROM telemetry.sourcemap WHERE project_id = :p AND debug_id = :d")
                .param("p", projectId)
                .param("d", debugId)
                .query(String.class)
                .optional();
    }

    /** 同一 debug_id 重传时覆盖：debug id 由产物内容决定，内容变了 id 就变了。 */
    public void save(String projectId, String debugId, String bundleUrl, String content) {
        jdbc.sql(
                        """
                        INSERT INTO telemetry.sourcemap (project_id, debug_id, bundle_url, content)
                        VALUES (:p, :d, :url, CAST(:content AS jsonb))
                        ON CONFLICT (project_id, debug_id) DO UPDATE SET
                            bundle_url  = COALESCE(EXCLUDED.bundle_url, telemetry.sourcemap.bundle_url),
                            content     = EXCLUDED.content,
                            uploaded_at = now()
                        """)
                .param("p", projectId)
                .param("d", debugId)
                .param("url", bundleUrl, java.sql.Types.VARCHAR)
                .param("content", content)
                .update();
    }
}
