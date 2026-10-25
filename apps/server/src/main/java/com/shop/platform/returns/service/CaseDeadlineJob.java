package com.shop.platform.returns.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import com.shop.platform.returns.mapper.CaseMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 售后超时推进。
 *
 * <p><b>只执行 {@code deadline_action}，不判断业务。</b> "商家 48 小时不处理自动同意"不是这里写的，
 * 是提交时写进 {@code deadline_*} 三列的值。加一条新规则（平台审核 24 小时、物流异常等 72 小时）
 * 是加一个枚举值，不是加一个 if。
 *
 * <p>单条失败不影响整批：一条数据坏了不该让其余几百条卡住。
 */
@Component
@ConditionalOnProperty(prefix = "shop.returns.deadline", name = "enabled", havingValue = "true", matchIfMissing = true)
public class CaseDeadlineJob implements ManualJob {

    private static final Logger log = LoggerFactory.getLogger(CaseDeadlineJob.class);

    static final String JOB_NAME = "shop.job.returns.deadline";

    private static final int BATCH = 200;

    private final CaseMapper cases;
    private final RmaService rma;
    private final JobLock jobLock;

    public CaseDeadlineJob(CaseMapper cases, RmaService rma, JobLock jobLock) {
        this.cases = cases;
        this.rma = rma;
        this.jobLock = jobLock;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(fixedDelayString = "${shop.returns.deadline.interval:PT5M}", initialDelayString = "PT1M")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int advanced = 0;
            for (CaseMapper.CaseRow row : cases.findDueInternal(BATCH)) {
                try {
                    advanced += rma.autoAdvance(row);
                } catch (RuntimeException e) {
                    // 一条坏数据不该让整批停住；下轮还会扫到它，日志里能定位
                    log.warn("售后超时推进失败：case={} action={}", row.id(), row.deadlineAction(), e);
                }
            }
            if (advanced > 0) {
                log.info("售后超时推进：{} 条", advanced);
            }
            return advanced;
        });
    }
}
