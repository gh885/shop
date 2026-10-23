package com.shop.platform.inventory.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 预占超时兜底。
 *
 * <p>主路径永远是订单关闭事件；这个任务是它丢了的保险。订单进程挂了、事件丢了、队列重建——任何一种都会让预占
 * 永久占着货，可售量再也回不来。挂着一天，那件货就少卖一天。
 *
 * <p>每批 500 条：一条预占要改两行（reservation + stock）再写一行流水，批量太大会把长事务拖出来。
 */
@Component
@ConditionalOnProperty(prefix = "shop.inventory.expiry", name = "enabled", havingValue = "true", matchIfMissing = true)
public class ExpiredReservationJob implements ManualJob {

    private static final Logger log = LoggerFactory.getLogger(ExpiredReservationJob.class);

    static final String JOB_NAME = "shop.job.inventory.expiry";

    private static final int BATCH = 500;

    private final InventoryService inventory;
    private final JobLock jobLock;

    public ExpiredReservationJob(InventoryService inventory, JobLock jobLock) {
        this.inventory = inventory;
        this.jobLock = jobLock;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(fixedDelayString = "${shop.inventory.expiry.interval:PT5M}", initialDelayString = "PT1M")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int released = inventory.releaseExpired(BATCH);
            if (released > 0) {
                log.info("预占超时兜底：释放 {} 条", released);
            }
            return released;
        });
    }
}
