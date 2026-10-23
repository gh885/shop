package com.shop.platform.pricing.service;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.pricing.mapper.PriceQuoteStore;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 报价证据清理。
 *
 * <p>每次试算往 {@code price_quote} 族写 1 + N + R + S 行，它是全库写入量最大的表族，
 * 而未支付的报价永远是 {@code issued}——没有这个任务就是无界增长，先拖慢 consume 的点查，
 * 再拖慢一切。证据只留 {@code retention} 天：投诉窗口过去了，逐行的分摊证据就没有读者了。
 */
@Component
@ConditionalOnProperty(prefix = "shop.pricing.cleanup", name = "enabled", havingValue = "true", matchIfMissing = true)
public class QuoteCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(QuoteCleanupJob.class);

    private final PriceQuoteStore quotes;
    private final JobLock jobLock;
    private final Duration retention;

    public QuoteCleanupJob(
            PriceQuoteStore quotes,
            JobLock jobLock,
            @Value("${shop.pricing.cleanup.retention:P30D}") Duration retention) {
        this.quotes = quotes;
        this.jobLock = jobLock;
        this.retention = retention;
    }

    @Scheduled(cron = "${shop.pricing.cleanup.cron:0 20 3 * * *}")
    public void cleanup() {
        jobLock.withLock("shop.job.pricing.cleanup", () -> {
            int purged = quotes.purgeExpired(Instant.now().minus(retention));
            if (purged > 0) {
                log.info("报价证据清理：删除 {} 张过期报价", purged);
            }
        });
    }
}
