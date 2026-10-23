package com.shop.platform.clearing.service;

import com.shop.platform.clearing.events.ReconciliationBroken;
import com.shop.platform.clearing.mapper.ReconciliationStore;
import com.shop.platform.clearing.model.FindingKind;
import com.shop.platform.common.id.Ids;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 内部对账：把"账本自己说的"和"账本实际记的"比一遍。
 *
 * <p>三层对账里只做最便宜的一层。渠道层要对账单文件、三方层要清算与打款回执，
 * 那两份数据源现在都没有——写出来的"对账"只能是假装对过，比不做更坏。
 *
 * <h2>为什么用 REPEATABLE READ</h2>
 *
 * 三条检查要看见<b>同一个瞬间</b>的账本。默认的 READ COMMITTED 下每条语句各拿一次快照，
 * 一笔正在记的账可能被第一条查询看见、被第三条看不见，于是对账报出一个根本不存在的差异。
 * PG 的 REPEATABLE READ 是快照隔离，不锁表、代价极小，正是这里要的语义。
 *
 * <h2>为什么不自动修</h2>
 *
 * 前两条（组内不平、币种不平）成立时账本已经坏了，往 suspense 记一笔"调平"会把坏账变成
 * 一个看起来正常的数字。第三条（余额缓存不符）真相没坏，重算就能修——但**谁在什么时候改的
 * 缓存**这个信息一旦被覆盖就永远丢了。所以三条一律只报告。
 *
 * <p>一个能自动抹平差异的对账系统，等于没有对账。
 */
@Service
public class ReconciliationService {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationService.class);

    /**
     * 每类差异最多留多少条样本。
     *
     * <p>一万个账户对不上时，把一万条塞进一个 jsonb 只会让这条记录本身查不动；
     * 而告警真正要的是"有几条、长什么样"。真实数量单独记在 {@code count} 里，不受这个上限影响。
     */
    private static final int SAMPLE_LIMIT = 20;

    /** 水位回拨量：防止边界上并发提交的分录落进两条水位之间的缝里。 */
    private static final java.time.Duration WINDOW_OVERLAP = java.time.Duration.ofHours(1);

    private final ReconciliationStore store;
    private final ApplicationEventPublisher publisher;

    private final ObjectMapper json = JsonMapper.builder().build();

    public ReconciliationService(ReconciliationStore store, ApplicationEventPublisher publisher) {
        this.store = Objects.requireNonNull(store, "store");
        this.publisher = Objects.requireNonNull(publisher, "publisher");
    }

    /**
     * 跑一轮对账。
     *
     * <p>结果落 {@code clearing.reconciliation_run}，发现差异时发 {@link ReconciliationBroken}。
     * 无论有没有差异都会留一条记录——"某天没跑"和"某天跑了但没事"必须能区分开。
     *
     * <p><b>增量水位。</b> 从上一次成功对账的时刻起扫（见 {@code ReconciliationStore.LAST_GOOD_RUN}）：
     * 账本是只追加的，水位之前查过且之后没动过的对象不可能自己坏掉，每晚全量重扫等于把成本
     * 交给账本长度线性涨。没有成功记录时水位落到 EPOCH，等价于全量——第一条底线是全查出来的。
     */
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public Report run() {
        Instant startedAt = Instant.now();
        Instant watermark = store.lastGoodRunStartedAt()
                .map(good -> good.minus(WINDOW_OVERLAP))
                .orElse(Instant.EPOCH);

        List<FindingGroup> findings = new ArrayList<>(FindingKind.values().length);
        findings.add(group(FindingKind.GROUP_UNBALANCED, store.unbalancedGroups(SAMPLE_LIMIT, watermark)));
        findings.add(group(FindingKind.CURRENCY_UNBALANCED, store.unbalancedCurrencies(watermark)));
        findings.add(group(FindingKind.BALANCE_MISMATCH, store.balanceMismatches(SAMPLE_LIMIT, watermark)));

        ReconciliationStore.Scope scope = store.scope();
        boolean broken = findings.stream().anyMatch(item -> item.count() > 0);

        UUID runId = store.insertRun(
                startedAt, broken, scope.groupCount(), scope.entryCount(), scope.accountCount(), write(findings));

        Report report = new Report(
                runId,
                startedAt,
                Instant.now(),
                broken,
                scope.groupCount(),
                scope.entryCount(),
                scope.accountCount(),
                findings);

        if (broken) {
            log.warn(
                    "对账发现差异：{}（本次扫描 {} 组 / {} 条分录 / {} 个账户，runId={}）",
                    findings.stream()
                            .filter(item -> item.count() > 0)
                            .map(item -> item.kind() + " " + item.count())
                            .toList(),
                    scope.groupCount(),
                    scope.entryCount(),
                    scope.accountCount(),
                    runId);
            publisher.publishEvent(new ReconciliationBroken(
                    Ids.newId(),
                    runId,
                    findings.stream()
                            .filter(item -> item.count() > 0)
                            .map(item -> new ReconciliationBroken.KindCount(item.kind(), item.count()))
                            .toList(),
                    Instant.now()));
        }

        return report;
    }

    /** 最近几次对账。默认 10 次，够看"最近两天有没有坏过"。 */
    public List<Report> recent(int limit) {
        return store.recent(Math.clamp(limit, 1, 100)).stream()
                .map(row -> new Report(
                        row.id(),
                        row.startedAt(),
                        row.finishedAt(),
                        row.broken(),
                        row.groupCount(),
                        row.entryCount(),
                        row.accountCount(),
                        read(row.findingsJson())))
                .toList();
    }

    private static FindingGroup group(FindingKind kind, List<ReconciliationStore.FindingRow> rows) {
        int count = rows.isEmpty() ? 0 : rows.getFirst().totalCount();
        List<Finding> samples = rows.stream()
                .map(row -> new Finding(row.subject(), row.expected(), row.actual()))
                .toList();
        return new FindingGroup(kind.dbValue(), count, samples);
    }

    private String write(List<FindingGroup> findings) {
        return json.writeValueAsString(findings);
    }

    private List<FindingGroup> read(String raw) {
        List<FindingGroup> parsed = json.readValue(raw, new TypeReference<ArrayList<FindingGroup>>() {});
        return parsed == null ? List.of() : List.copyOf(parsed);
    }

    /**
     * 一次对账的结果。
     *
     * @param broken 三类差异里任意一类非空
     */
    public record Report(
            UUID runId,
            Instant startedAt,
            Instant finishedAt,
            boolean broken,
            int groupCount,
            int entryCount,
            int accountCount,
            List<FindingGroup> findings) {}

    /**
     * 一类差异。
     *
     * @param kind    见 {@code FindingKind.dbValue()}
     * @param count   真实数量；可能大于 {@code samples.size()}
     * @param samples 截断后的样本，最多 20 条
     */
    public record FindingGroup(String kind, int count, List<Finding> samples) {}

    /**
     * 一条差异。
     *
     * @param subject  出问题的对象：分录组号 / 币种 / {@code owner_type/owner_id/account_type/currency}
     * @param expected 应该是什么
     * @param actual   现在是什么
     */
    public record Finding(String subject, long expected, long actual) {}
}
