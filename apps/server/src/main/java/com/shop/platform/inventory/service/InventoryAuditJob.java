package com.shop.platform.inventory.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import com.shop.platform.inventory.mapper.InventoryAuditMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 库存日检：验三条不变式，<b>只报告不抹平</b>。
 *
 * <p>平台是记账方，不是裁决方。查到不平就记 ERROR 和指标，等人工判断——
 * 自动"修"一笔账，等于把一个能被查出来的错误变成一个查不出来的错误。
 *
 * <p>三条检查各自对应一条会被绕过的不变式：
 *
 * <ul>
 *   <li><b>守恒式</b>：{@code on_hand = atp + reserved + safety}。库约束已经在拦，查出来说明约束被拆了
 *   <li><b>账实漂移</b>：最后一条流水的 {@code after_*} 与库存行不一致。说明有人直接 UPDATE 了 stock
 *   <li><b>负可售</b>：兜底。即时告警在 {@code adjustAll} 里做（那是唯一能造出负值的入口）
 * </ul>
 *
 * <p>cron 选 02:45 是与 clearing 的日终对账（02:30）错峰：两者都是全表扫描，
 * 同时跑会把调度线程池（4 个）和 IO 一起挤住，而它们在业务上互不相干。
 */
@Component
@ConditionalOnProperty(prefix = "shop.inventory.audit", name = "enabled", havingValue = "true", matchIfMissing = true)
public class InventoryAuditJob implements ManualJob {

    static final String JOB_NAME = "shop.job.inventory.audit";

    private static final Logger log = LoggerFactory.getLogger(InventoryAuditJob.class);

    private final InventoryAuditMapper audit;
    private final JobLock jobLock;
    private final MeterRegistry registry;

    public InventoryAuditJob(InventoryAuditMapper audit, JobLock jobLock, MeterRegistry registry) {
        this.audit = Objects.requireNonNull(audit, "audit");
        this.jobLock = Objects.requireNonNull(jobLock, "jobLock");
        this.registry = Objects.requireNonNull(registry, "registry");
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(cron = "${shop.inventory.audit.cron:0 45 2 * * *}")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int findings = 0;
            findings += report(
                    "守恒式",
                    audit.brokenBalance(),
                    "库存守恒式被破坏（on_hand ≠ 可售 + 预占 + 安全）。ck_stock_balance 本该挡住这种事，" + "有人拆了约束或绕过接口改了表");
            findings += report(
                    "账实漂移", audit.ledgerDrift(), "库存行与最后一条流水对不上。说明有人直接 UPDATE stock 绕过了接口，" + "那一次变动没有流水，账实从此错位");
            findings += report("负可售", audit.oversold(), "可售量为负，账上已经超卖。补偿在途订单并追商家，不要自动调平");

            if (findings == 0) {
                log.info("库存日检通过：守恒式、账实一致、无可售为负");
            }
            return findings;
        });
    }

    /**
     * 报一类问题。返回发现条数——{@code JobLock} 用它记 {@code shop.job.processed}。
     *
     * <p>SKU 只打前 20 个：一次全表扫描可能扫出几千行，把整份清单写进日志等于让这条 ERROR 被截断，
     * 而截断的那一半正是最需要看的。指标给的是真实总数，不是样本数。
     */
    private int report(String what, List<UUID> skus, String advice) {
        if (skus.isEmpty()) {
            return 0;
        }
        log.error(
                "库存日检发现{}：{} 条。样本={}。{}",
                what,
                skus.size(),
                skus.stream().limit(20).toList(),
                advice);
        Counter.builder("shop.inventory.audit.broken")
                .tag("check", what)
                .description("库存日检发现的异常条数（真实数量，非样本数）")
                .register(registry)
                .increment(skus.size());
        return skus.size();
    }
}
