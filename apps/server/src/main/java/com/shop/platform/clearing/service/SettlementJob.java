package com.shop.platform.clearing.service;

import com.shop.platform.clearing.mapper.SettlementMapper;
import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 结算日结。每小时跑一次，扫"已解冻且过了 T+7"的明细。
 *
 * <p>按商家一批、一批一笔打款：拆多通道是以后的事，现在拆了也没有第二个通道可用。
 *
 * <p><b>每商家一个事务，单批失败只跳过那一家</b>——一个商家的账算不清，不该让全平台都结不了。
 * 互斥有两层：任务入口的调度锁（{@code JobLock}）挡多实例同跑；
 * 就算锁丢了，每家事务里的 {@code FOR UPDATE SKIP LOCKED} 认领也让第二个实例拿到空列表直接走人。
 */
@Component
@ConditionalOnProperty(prefix = "shop.clearing.settle", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SettlementJob implements ManualJob {

    static final String JOB_NAME = "shop.job.clearing.settle";

    private static final Logger log = LoggerFactory.getLogger(SettlementJob.class);

    private final SettlementService settlement;
    private final JobLock jobLock;

    public SettlementJob(SettlementService settlement, JobLock jobLock) {
        this.settlement = settlement;
        this.jobLock = jobLock;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(
            fixedDelayString = "${shop.clearing.settle.interval:PT1H}",
            initialDelayString = "${shop.clearing.settle.initial-delay:PT2M}")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int settled = 0;
            List<SettlementMapper.MerchantDue> due = settlement.dueMerchants(Instant.now());
            for (SettlementMapper.MerchantDue merchant : due) {
                try {
                    if (settlement.settleMerchant(merchant.merchantId(), merchant.currency(), Instant.now())) {
                        settled++;
                    }
                } catch (RuntimeException e) {
                    // 只回滚这一家；下一轮 DUE_MERCHANTS 还会把它扫出来
                    log.warn("结算失败，跳过该商家，下一轮重试：merchant={}", merchant.merchantId(), e);
                }
            }
            if (settled > 0) {
                log.info("本轮结算：{} 个商家", settled);
            }
            return settled;
        });
    }
}
