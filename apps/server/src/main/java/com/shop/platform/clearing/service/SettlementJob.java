package com.shop.platform.clearing.service;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 结算日结。每小时跑一次，扫"已解冻且过了 T+7"的明细。
 *
 * <p>按商家一批、一批一笔打款：拆多通道是以后的事，现在拆了也没有第二个通道可用。
 * 单批失败不影响其他商家——一个商家的账算不清，不该让全平台都结不了。
 */
@Component
@ConditionalOnProperty(prefix = "shop.clearing.settle", name = "enabled", havingValue = "true", matchIfMissing = true)
public class SettlementJob {

    private static final Logger log = LoggerFactory.getLogger(SettlementJob.class);

    private final SettlementService settlement;

    public SettlementJob(SettlementService settlement) {
        this.settlement = settlement;
    }

    @Scheduled(
            fixedDelayString = "${shop.clearing.settle.interval:PT1H}",
            initialDelayString = "${shop.clearing.settle.initial-delay:PT2M}")
    public void settleDue() {
        try {
            int settled = settlement.settle(Instant.now());
            if (settled > 0) {
                log.info("本轮结算：{} 个商家", settled);
            }
        } catch (RuntimeException e) {
            log.warn("结算任务失败，下一轮重试", e);
        }
    }
}
