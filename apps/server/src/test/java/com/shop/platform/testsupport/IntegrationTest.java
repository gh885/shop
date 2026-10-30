package com.shop.platform.testsupport;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * 真库集成测试基类：自带 PG/Redis 容器 + 每例前整库清场。
 *
 * <p><b>容器</b>：静态 {@code @ServiceConnection} 字段由 Spring Boot 接线到 DataSource /
 * RedisConnectionFactory，测试不再依赖 compose 预起的 shop_test。镜像版本与 compose.dev.yml
 * 一致；所有子类共享同一份上下文配置，整个 suite 只起一对容器、一个 Spring 上下文。
 *
 * <p><b>清场</b>：每例前 {@code TRUNCATE ... CASCADE} 全部业务表，然后**回植基线**。
 * 迁移脚本里种过数据的表（{@link #PROTECTED}，权限点/审计动作/角色授权这类注册表）被
 * 多个 Spring 上下文的启动自检依赖（如 Authorizer 的启动比对），且 CASCADE 会顺着外键
 * 波及它们，所以不能简单豁免——做法是首跑前快照这些表的内容，每次清场后原样回植
 * （借 {@code session_replication_role = replica} 绕过回植顺序，容器用户是超级用户）。
 * 基线永远等于「迁移刚跑完的状态」，不受任何测试污染。
 *
 * <p>刻意不做 @Transactional 回滚——AFTER_COMMIT 监听、outbox、CAS 可见性只有真提交
 * 才验得到（与 main 分支 TestDb 的同一结论）。
 *
 * <p><b>前提</b>：surefire 顺序执行（pom 无并行配置）。将来若开测试并行，此清场失效，
 * 需要换登记制或按类分库——改这里之前先想清楚。
 */
@SpringBootTest
@ActiveProfiles("test")
public abstract class IntegrationTest {

    @ServiceConnection
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @ServiceConnection
    private static final GenericContainer<?> REDIS = new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    /**
     * 迁移脚本种过数据、要保基线的表。新增带种子数据的迁移时同步维护——
     * 判断方法：迁移文件里 grep「INSERT INTO 该表」。
     */
    private static final Set<String> PROTECTED = Set.of(
            "common.permission",
            "audit.audit_action",
            "staff.role_permission",
            "catalog.attribute_value",
            "catalog.category_config",
            "governance.category_grant",
            "promotion.rule");

    @Autowired
    protected JdbcTemplate jdbc;

    @Autowired
    protected org.springframework.data.redis.connection.RedisConnectionFactory redisConnectionFactory;

    private static Map<String, List<Map<String, Object>>> baseline;

    @BeforeEach
    void resetDatabase() {
        if (baseline == null) {
            captureBaseline();
        }
        List<String> tables = jdbc.queryForList(
                "SELECT table_schema || '.' || table_name FROM information_schema.tables "
                        + "WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') "
                        + "AND table_name <> 'flyway_schema_history'",
                String.class);
        if (!tables.isEmpty()) {
            jdbc.execute("TRUNCATE TABLE " + String.join(", ", tables) + " CASCADE");
        }
        restoreBaseline();
        // 缓存与限流/幂等键同住 db 15：DB 清了而缓存还在，下一个测试会读到上一个测试的类目树。
        // 全 flush 比逐缓存 clear 干净——限流计数、幂等结果也一并归零，跨测试零残留。
        try (var connection = redisConnectionFactory.getConnection()) {
            connection.serverCommands().flushDb();
        }
    }

    private void captureBaseline() {
        baseline = new LinkedHashMap<>();
        for (String table : PROTECTED) {
            // 表可能随后续迁移改名/退场：快照时容错跳过，别让清场基建卡住业务测试
            Long count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema || '.' || table_name = ?",
                    Long.class,
                    table);
            if (count != null && count > 0) {
                baseline.put(table, jdbc.queryForList("SELECT * FROM " + table));
            }
        }
    }

    private void restoreBaseline() {
        jdbc.execute("SET session_replication_role = replica");
        try {
            for (Map.Entry<String, List<Map<String, Object>>> entry : baseline.entrySet()) {
                List<Map<String, Object>> rows = entry.getValue();
                if (rows.isEmpty()) {
                    continue;
                }
                String table = entry.getKey();
                List<String> columns = rows.getFirst().keySet().stream().toList();
                String placeholders =
                        String.join(", ", columns.stream().map(c -> "?").toList());
                String insert =
                        "INSERT INTO " + table + " (" + String.join(", ", columns) + ") VALUES (" + placeholders + ")";
                for (Map<String, Object> row : rows) {
                    jdbc.update(insert, columns.stream().map(row::get).toArray());
                }
            }
        } finally {
            jdbc.execute("SET session_replication_role = DEFAULT");
        }
    }
}
