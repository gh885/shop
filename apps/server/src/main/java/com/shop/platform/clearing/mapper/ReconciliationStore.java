package com.shop.platform.clearing.mapper;

import com.shop.platform.infra.db.RowMappers;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * 对账的 SQL。三条检查各一条查询，加一条落记录、一条读记录。
 *
 * <p><b>每条查询都带 {@code count(*) OVER ()}</b>：它算的是过滤后的总行数，不受 {@code LIMIT} 影响。
 * 这样"有多少条"和"给我看几条"一次查完，不会出现两次查询之间账本变了、count 和样本对不上。
 *
 * <p>查询一律不写 {@code WHERE ... = :param} 之外的判断：对账要的是"账本现在长什么样"，
 * 任何"我觉得这条不该算"的过滤都会让差异藏起来。
 */
@Component
public class ReconciliationStore {

    /**
     * 组内合计不为 0。
     *
     * <p>用 LEFT JOIN 而不是 INNER：一条分录都没有的分录组合计是 0（空集求和），按这条不变量
     * 它是<b>合格</b>的，不该出现在这里。"记了业务没记钱"是另一条规则，这条查询管不着——
     * 与其把它硬塞进来报一条 {@code expected 0 / actual 0} 的看不懂的差异，不如说清楚它不在范围内。
     */
    private static final String UNBALANCED_GROUPS =
            """
            SELECT g.biz_no AS subject,
                   0 AS expected,
                   coalesce(sum(e.amount), 0) AS actual,
                   count(*) OVER () AS total_count
              FROM clearing.posting_group g
              LEFT JOIN clearing.ledger_entry e ON e.group_id = g.id
             GROUP BY g.id, g.biz_no
            HAVING coalesce(sum(e.amount), 0) <> 0
             ORDER BY g.biz_no
             LIMIT :limit
            """;

    /** 全库按币种合计不为 0。币种在分录组上，分录本身不带币种——同一组必然同币种。 */
    private static final String UNBALANCED_CURRENCIES =
            """
            SELECT g.currency AS subject,
                   0 AS expected,
                   coalesce(sum(e.amount), 0) AS actual,
                   count(*) OVER () AS total_count
              FROM clearing.posting_group g
              LEFT JOIN clearing.ledger_entry e ON e.group_id = g.id
             GROUP BY g.currency
            HAVING coalesce(sum(e.amount), 0) <> 0
             ORDER BY g.currency
            """;

    /**
     * 余额缓存与分录重算不符。
     *
     * <p>{@code expected} 是从分录重算出来的真值，{@code actual} 是缓存里躺着的数——
     * 名字按"应该是什么 / 现在是什么"取，不按谁先算出来取。
     */
    private static final String BALANCE_MISMATCHES =
            """
            SELECT a.owner_type || '/' || a.owner_id || '/' || a.account_type || '/' || a.currency AS subject,
                   coalesce(sum(e.amount), 0) AS expected,
                   a.balance AS actual,
                   count(*) OVER () AS total_count
              FROM clearing.account a
              LEFT JOIN clearing.ledger_entry e ON e.account_id = a.id
             GROUP BY a.id, a.owner_type, a.owner_id, a.account_type, a.currency, a.balance
            HAVING a.balance <> coalesce(sum(e.amount), 0)
             ORDER BY subject
             LIMIT :limit
            """;

    /** 扫了多大范围。对账报告上没有这个数，就分不清"没问题"和"没扫到东西"。 */
    private static final String SCOPE =
            """
            SELECT (SELECT count(*) FROM clearing.posting_group) AS group_count,
                   (SELECT count(*) FROM clearing.ledger_entry) AS entry_count,
                   (SELECT count(*) FROM clearing.account) AS account_count
            """;

    private static final String INSERT_RUN =
            """
            INSERT INTO clearing.reconciliation_run
                (started_at, broken, group_count, entry_count, account_count, findings)
            VALUES (:startedAt, :broken, :groupCount, :entryCount, :accountCount, CAST(:findings AS jsonb))
            RETURNING id
            """;

    private static final String RECENT =
            """
            SELECT id, started_at, finished_at, broken, group_count, entry_count, account_count,
                   CAST(findings AS text) AS findings_json
              FROM clearing.reconciliation_run
             ORDER BY started_at DESC
             LIMIT :limit
            """;

    private static final RowMapper<FindingRow> FINDING_ROW = RowMappers.of(FindingRow.class);

    private final JdbcClient jdbc;

    public ReconciliationStore(JdbcClient jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "jdbc");
    }

    public java.util.List<FindingRow> unbalancedGroups(int limit) {
        return jdbc.sql(UNBALANCED_GROUPS)
                .param("limit", limit)
                .query(FINDING_ROW)
                .list();
    }

    public java.util.List<FindingRow> unbalancedCurrencies() {
        return jdbc.sql(UNBALANCED_CURRENCIES).query(FINDING_ROW).list();
    }

    public java.util.List<FindingRow> balanceMismatches(int limit) {
        return jdbc.sql(BALANCE_MISMATCHES)
                .param("limit", limit)
                .query(FINDING_ROW)
                .list();
    }

    public Scope scope() {
        return jdbc.sql(SCOPE).query(RowMappers.of(Scope.class)).single();
    }

    public UUID insertRun(
            Instant startedAt, boolean broken, int groupCount, int entryCount, int accountCount, String findingsJson) {
        return jdbc.sql(INSERT_RUN)
                .param("startedAt", RowMappers.toDb(startedAt))
                .param("broken", broken)
                .param("groupCount", groupCount)
                .param("entryCount", entryCount)
                .param("accountCount", accountCount)
                .param("findings", findingsJson)
                .query(UUID.class)
                .single();
    }

    public java.util.List<RunRow> recent(int limit) {
        return jdbc.sql(RECENT)
                .param("limit", limit)
                .query(RowMappers.of(RunRow.class))
                .list();
    }

    /**
     * 一条差异。
     *
     * @param subject  出问题的对象：分录组号 / 币种 / {@code owner_type/owner_id/account_type/currency}
     * @param expected 应该是什么（0，或从分录重算出来的余额）
     * @param actual   现在是什么（组内合计，或缓存里的余额）
     */
    public record FindingRow(String subject, long expected, long actual, int totalCount) {}

    /** 扫过的行数。三个都可能是 0——空库跑对账也应该是"没差异"，不是"没跑"。 */
    public record Scope(int groupCount, int entryCount, int accountCount) {}

    public record RunRow(
            UUID id,
            Instant startedAt,
            Instant finishedAt,
            boolean broken,
            int groupCount,
            int entryCount,
            int accountCount,
            String findingsJson) {}
}
