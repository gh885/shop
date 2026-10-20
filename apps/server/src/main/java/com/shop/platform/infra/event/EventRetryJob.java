package com.shop.platform.infra.event;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 事件补发。
 *
 * <p>outbox 只保证「事件一定落了库」，不保证「一定会被消费成功」。监听器抛异常、进程中途挂掉、下游维护，
 * 都会让一条登记停在 {@code completion_date IS NULL} 上。没有这个任务，那条事件就静静躺在那儿，
 * 而系统看上去一切正常——这是事件驱动架构最典型的哑火方式。
 *
 * <p>三条边界，都是从「补发本身也是写操作」推出来的：
 *
 * <ul>
 *   <li><b>只捡够老的</b>（{@code minAge}）。太新的可能正在跑，抢过来就是重复消费。
 *   <li><b>重投有上限</b>（{@code maxAttempts}）。没有上限的话，一个永远失败的监听器会被打成风扇，
 *       把日志和下游一起拖死。超限的留给人工，并且会被指标看见。
 *   <li><b>不并发</b>。{@code fixedDelay} 保证单实例内不重入；多实例要靠数据库锁，现在没有，写在这里记着。
 * </ul>
 */
@Component
@EnableConfigurationProperties(EventRetryProperties.class)
@ConditionalOnProperty(prefix = "shop.event.retry", name = "enabled", havingValue = "true")
public class EventRetryJob {

    private static final Logger log = LoggerFactory.getLogger(EventRetryJob.class);

    /** 指标名。盯它就是盯整条事件链路的健康度。 */
    static final String OLDEST_INCOMPLETE_METRIC = "shop.event.oldest_incomplete";

    private final IncompleteEventPublications incompletePublications;

    private final EventPublicationStore store;

    private final EventRetryProperties properties;

    public EventRetryJob(
            IncompleteEventPublications incompletePublications,
            EventPublicationStore store,
            EventRetryProperties properties,
            MeterRegistry meterRegistry) {
        this.incompletePublications = incompletePublications;
        this.store = store;
        this.properties = properties;

        Gauge.builder(OLDEST_INCOMPLETE_METRIC, store, EventPublicationStore::oldestIncompleteAgeSeconds)
                .description("最老未完成事件的年龄（秒）。持续上涨说明有消费者在失败")
                .register(meterRegistry);
    }

    @Scheduled(
            fixedDelayString = "${shop.event.retry.interval:PT30S}",
            initialDelayString = "${shop.event.retry.interval:PT30S}")
    public void resubmit() {
        int candidates = resubmitNow();
        if (candidates > 0) {
            log.info("事件补发：本轮候选 {} 条，最老未完成 {} 秒", candidates, store.oldestIncompleteAgeSeconds());
        }
        warnIfStuck();
    }

    /**
     * 立刻补发一轮，返回候选条数。
     *
     * <p>单独开这个方法是为了让测试能同步驱动它，不必等定时器。
     */
    public int resubmitNow() {
        AtomicInteger seen = new AtomicInteger();
        ResubmissionOptions options = ResubmissionOptions.defaults()
                .withMinAge(properties.minAge())
                .withBatchSize(properties.batchSize())
                .withMaxInFlight(properties.maxInFlight())
                .withFilter(publication -> {
                    seen.incrementAndGet();
                    return withinAttemptBudget(publication);
                });

        incompletePublications.resubmitIncompletePublications(options);
        return seen.get();
    }

    private boolean withinAttemptBudget(EventPublication publication) {
        return publication.getCompletionAttempts() < properties.maxAttempts();
    }

    /**
     * 卡住的事件不会自己喊救命。
     *
     * <p>重投超限之后它就彻底不动了，如果不打这条日志，唯一的迹象就是指标上那条永远平的线——
     * 而那正是没人会去看的东西。
     */
    private void warnIfStuck() {
        Duration stuckAfter = properties.stuckAfter();
        double oldest = store.oldestIncompleteAgeSeconds();
        if (oldest >= stuckAfter.toSeconds()) {
            log.warn(
                    "事件补发：最老未完成事件已 {} 秒（阈值 {} 秒），未完成共 {} 条，超过 {} 次重投的需人工处理",
                    Math.round(oldest),
                    stuckAfter.toSeconds(),
                    store.countIncomplete(),
                    properties.maxAttempts());
        }
    }
}
