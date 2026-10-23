package com.shop.platform.infra.event;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.modulith.events.CompletedEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 事件链路的清理。
 *
 * <p>两条只追加的流水没有清理就是无界增长：每条成功事件在 {@code event_publication} 留一行
 * （还带一个对大文本的 hash 索引），每次消费在 {@code consumed_event} 留一行——它们是全链路里
 * 增长最快的表。留 {@code retention} 天足够：投诉回溯和重投窗口（分钟级、次数有上限）都盖住了。
 *
 * <p>只删<b>已完成</b>的登记。未完成的事件是 {@link EventRetryJob} 的病人，动了它等于销毁病历。
 */
@Component
@ConditionalOnProperty(prefix = "shop.event.cleanup", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EventCleanupJob implements ManualJob {

    static final String JOB_NAME = "shop.job.event.cleanup";

    private static final Logger log = LoggerFactory.getLogger(EventCleanupJob.class);

    private final CompletedEventPublications completed;
    private final EventInbox inbox;
    private final JobLock jobLock;
    private final Duration retention;

    public EventCleanupJob(
            CompletedEventPublications completed,
            EventInbox inbox,
            JobLock jobLock,
            @Value("${shop.event.cleanup.retention:P7D}") Duration retention) {
        this.completed = completed;
        this.inbox = inbox;
        this.jobLock = jobLock;
        this.retention = retention;
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(cron = "${shop.event.cleanup.cron:0 10 3 * * *}")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            completed.deletePublicationsOlderThan(retention);
            int purged = inbox.purgeOlderThan(Instant.now().minus(retention));
            if (purged > 0) {
                log.info("事件清理：删除 {} 条过期消费记录（登记完成记录由 Modulith 一并清理）", purged);
            }
            // 登记完成记录的删除量 Modulith 不返回，只计消费去重记录——量级同源，够看趋势
            return purged;
        });
    }
}
