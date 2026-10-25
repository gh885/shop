package com.shop.platform.clearing.mapper;

import com.shop.platform.common.id.Ids;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 对账的 SQL。三条检查各一条查询，加一条落记录、一条读记录。
 *
 * <p><b>每条查询都带 {@code count(*) OVER ()}</b>：它算的是过滤后的总行数，不受 {@code LIMIT} 影响。
 * 这样"有多少条"和"给我看几条"一次查完，不会出现两次查询之间账本变了、count 和样本对不上。
 *
 * <p>查询一律不写 {@code WHERE ... = #{param}} 之外的判断：对账要的是"账本现在长什么样"，
 * 任何"我觉得这条不该算"的过滤都会让差异藏起来。
 */
@Mapper
public interface ReconciliationMapper {

    /**
     * 组内合计不为 0。
     *
     * <p>用 LEFT JOIN 而不是 INNER：一条分录都没有的分录组合计是 0（空集求和），按这条不变量
     * 它是<b>合格</b>的，不该出现在这里。"记了业务没记钱"是另一条规则，这条查询管不着——
     * 与其把它硬塞进来报一条 {@code expected 0 / actual 0} 的看不懂的差异，不如说清楚它不在范围内。
     */
    @Select(
            """
            SELECT g.biz_no AS subject,
                   0 AS expected,
                   coalesce(sum(e.amount), 0) AS actual,
                   count(*) OVER () AS total_count
              FROM clearing.posting_group g
              LEFT JOIN clearing.ledger_entry e ON e.group_id = g.id
             WHERE g.occurred_at >= #{watermark}
             GROUP BY g.id, g.biz_no
            HAVING coalesce(sum(e.amount), 0) <> 0
             ORDER BY g.biz_no
             LIMIT #{limit}
            """)
    List<FindingRow> unbalancedGroups(@Param("limit") int limit, @Param("watermark") Instant watermark);

    /** 全库按币种合计不为 0。币种在分录组上，分录本身不带币种——同一组必然同币种。 */
    @Select(
            """
            SELECT g.currency AS subject,
                   0 AS expected,
                   coalesce(sum(e.amount), 0) AS actual,
                   count(*) OVER () AS total_count
              FROM clearing.posting_group g
              LEFT JOIN clearing.ledger_entry e ON e.group_id = g.id
             WHERE g.currency IN (SELECT DISTINCT g2.currency FROM clearing.posting_group g2
                                   WHERE g2.occurred_at >= #{watermark})
             GROUP BY g.currency
            HAVING coalesce(sum(e.amount), 0) <> 0
             ORDER BY g.currency
            """)
    List<FindingRow> unbalancedCurrencies(@Param("watermark") Instant watermark);

    /**
     * 余额缓存与分录重算不符。
     *
     * <p>{@code expected} 是从分录重算出来的真值，{@code actual} 是缓存里躺着的数——
     * 名字按"应该是什么 / 现在是什么"取，不按谁先算出来取。
     */
    @Select(
            """
            SELECT a.owner_type || '/' || a.owner_id || '/' || a.account_type || '/' || a.currency AS subject,
                   coalesce(sum(e.amount), 0) AS expected,
                   a.balance AS actual,
                   count(*) OVER () AS total_count
              FROM clearing.ledger_account a
              LEFT JOIN clearing.ledger_entry e ON e.account_id = a.id
             WHERE EXISTS (SELECT 1 FROM clearing.ledger_entry w
                            WHERE w.account_id = a.id AND w.posted_at >= #{watermark})
             GROUP BY a.id, a.owner_type, a.owner_id, a.account_type, a.currency, a.balance
            HAVING a.balance <> coalesce(sum(e.amount), 0)
             ORDER BY subject
             LIMIT #{limit}
            """)
    List<FindingRow> balanceMismatches(@Param("limit") int limit, @Param("watermark") Instant watermark);

    /** 扫了多大范围。对账报告上没有这个数，就分不清"没问题"和"没扫到东西"。 */
    @Select(
            """
            SELECT (SELECT count(*) FROM clearing.posting_group) AS group_count,
                   (SELECT count(*) FROM clearing.ledger_entry) AS entry_count,
                   (SELECT count(*) FROM clearing.ledger_account) AS account_count
            """)
    Scope scope();

    /**
     * 增量水位：上一次成功（broken=false）对账的开始时刻。
     *
     * <p>三条检查都只扫"水位之后动过的账"：分录组只追加、账户余额只随分录变，
     * 水位之前查过且之后没动过的对象不可能自己坏掉。没有成功过就返回空——调用方落到
     * EPOCH 等价于全量。水位刻意回拨一小时做窗口重叠，防止边界上并发提交的分录漏扫。
     */
    @Select("""
            SELECT max(started_at) FROM clearing.reconciliation_run WHERE NOT broken
            """)
    Optional<Instant> lastGoodRunStartedAt();

    /** 主键由应用侧生成：报告和事件在落库那一刻就要拿着 runId，注解 SQL 拿不到 RETURNING 的返回值。 */
    default UUID insertRun(
            Instant startedAt, boolean broken, int groupCount, int entryCount, int accountCount, String findingsJson) {
        UUID id = Ids.newId();
        insertRunRow(id, startedAt, broken, groupCount, entryCount, accountCount, findingsJson);
        return id;
    }

    @Insert(
            """
            INSERT INTO clearing.reconciliation_run
                (id, started_at, broken, group_count, entry_count, account_count, findings)
            VALUES (#{id}, #{startedAt}, #{broken}, #{groupCount}, #{entryCount}, #{accountCount},
                    CAST(#{findings} AS jsonb))
            """)
    void insertRunRow(
            @Param("id") UUID id,
            @Param("startedAt") Instant startedAt,
            @Param("broken") boolean broken,
            @Param("groupCount") int groupCount,
            @Param("entryCount") int entryCount,
            @Param("accountCount") int accountCount,
            @Param("findings") String findingsJson);

    @Select(
            """
            SELECT id, started_at, finished_at, broken, group_count, entry_count, account_count,
                   CAST(findings AS text) AS findings_json
              FROM clearing.reconciliation_run
             ORDER BY started_at DESC
             LIMIT #{limit}
            """)
    List<RunRow> recent(@Param("limit") int limit);

    /**
     * 一条差异。
     *
     * @param subject  出问题的对象：分录组号 / 币种 / {@code owner_type/owner_id/account_type/currency}
     * @param expected 应该是什么（0，或从分录重算出来的余额）
     * @param actual   现在是什么（组内合计，或缓存里的余额）
     */
    record FindingRow(String subject, long expected, long actual, int totalCount) {}

    /** 扫过的行数。三个都可能是 0——空库跑对账也应该是"没差异"，不是"没跑"。 */
    record Scope(int groupCount, int entryCount, int accountCount) {}

    record RunRow(
            UUID id,
            Instant startedAt,
            Instant finishedAt,
            boolean broken,
            int groupCount,
            int entryCount,
            int accountCount,
            String findingsJson) {}
}
