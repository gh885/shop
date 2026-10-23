package com.shop.platform.trade.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import com.shop.platform.trade.mapper.OrderGroupStore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 超时关单的驱动者：到点扫描，把 {@link TradeService#closeExpired} 跑起来。
 *
 * <p>关单逻辑（关组 → 关子单 → 释放预占 → 记事件）与支付回调用同一个前置条件
 * {@code payment_status='unpaid' AND closed_at IS NULL}，谁改到行谁赢。没有这个扫描时
 * 那个 CAS 只防得住买家手点取消——"超时关单"从未发生，过期未付单永远挂着，可付窗口
 * 关了、库存也回不来。设计契约见 order-model.md「支付回调 vs 超时撤销」。
 *
 * <p>它也是库存预占释放的<b>主路径</b>（关单 → {@code releaseAll}）；inventory 的
 * ExpiredReservationJob 是它丢了时的保险，预占 {@code expires_at} 比订单多 10 分钟，
 * 就是给主路径留的先手。
 *
 * <p>扫描只捞过 5 分钟宽限的单：第 29 分付款、回调还在路上的那单，不该被抢先处决。
 * 单组失败不挡同批其他组——失败的还是 unpaid + open，下一轮照旧扫到。
 */
@Component
@ConditionalOnProperty(prefix = "shop.trade.expiry", name = "enabled", havingValue = "true", matchIfMissing = true)
public class OrderExpiryJob implements ManualJob {

    private static final Logger log = LoggerFactory.getLogger(OrderExpiryJob.class);

    static final String JOB_NAME = "shop.job.trade.expiry";

    /** 每批 100 组：一组要关组、关子单、释放预占、记事件，比支付关单那种单条批量 UPDATE 重得多。 */
    private static final int BATCH = 100;

    private final OrderGroupStore groups;
    private final TradeService trades;
    private final JobLock jobLock;

    public OrderExpiryJob(OrderGroupStore groups, TradeService trades, JobLock jobLock) {
        this.groups = groups;
        this.trades = trades;
        this.jobLock = jobLock;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(fixedDelayString = "${shop.trade.expiry.interval:PT5M}", initialDelayString = "PT1M")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int closed = 0;
            for (OrderGroupStore.GroupRow group : groups.findExpired(BATCH)) {
                try {
                    if (trades.closeExpired(group.id())) {
                        closed++;
                    }
                } catch (RuntimeException e) {
                    log.warn("超时关单失败，下一轮重试：groupId={}", group.id(), e);
                }
            }
            if (closed > 0) {
                log.info("订单超时关单：{} 组", closed);
            }
            return closed;
        });
    }
}
