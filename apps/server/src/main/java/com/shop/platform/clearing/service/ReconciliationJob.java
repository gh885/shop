package com.shop.platform.clearing.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 日终对账。每天凌晨跑一次。
 *
 * <p>用 cron 而不是 {@code fixedDelay}：对账要落在"账期结束之后、第二天业务开始之前"这个窗口里，
 * 隔 24 小时跑一次的话，跑着跑着就会漂到白天，那时正在记账，报告里全是"正在处理"的噪声。
 *
 * <p>失败不重试：异常抛出 withLock 进 {@code shop.job.failure}、由调度层记 ERROR，
 * 下一轮（次日）再来。自动重试反而会在账本真出问题时刷出一串重复告警，把第一次那条有用的埋掉。
 */
@Component
@ConditionalOnProperty(
        prefix = "shop.clearing.reconcile",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = true)
public class ReconciliationJob implements ManualJob {

    static final String JOB_NAME = "shop.job.clearing.reconcile";

    private static final Logger log = LoggerFactory.getLogger(ReconciliationJob.class);

    private final ReconciliationService reconciliation;
    private final JobLock jobLock;

    public ReconciliationJob(ReconciliationService reconciliation, JobLock jobLock) {
        this.reconciliation = reconciliation;
        this.jobLock = jobLock;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(cron = "${shop.clearing.reconcile.cron:0 30 2 * * *}")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            ReconciliationService.Report report = reconciliation.run();
            if (!report.broken()) {
                log.info(
                        "日终对账通过：{} 组 / {} 条分录 / {} 个账户",
                        report.groupCount(),
                        report.entryCount(),
                        report.accountCount());
            }
            // 处理条数 = 差异总条数：对账这轮"干了多少活"就是"发现了多少坏"
            return report.findings().stream()
                    .mapToInt(ReconciliationService.FindingGroup::count)
                    .sum();
        });
    }
}
