package com.shop.platform.infra.event;

import com.shop.platform.infra.scheduler.JobLock;
import com.shop.platform.infra.scheduler.ManualJob;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.modulith.events.EventPublication;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 事件补发。
 *
 * <p>outbox 只保证「事件一定落了库」，不保证「一定会被消费成功」。监听器抛异常、进程中途挂掉、下游维护，
 * 都会让一条登记停在 {@code completion_date IS NULL} 上。没有这个任务，那条事件就静静躺在那儿，
 * 而系统看上去一切正常——这是事件驱动架构最典型的哑火方式。
 *
 * <p>四条边界，都是从「补发本身也是写操作」推出来的：
 *
 * <ul>
 *   <li><b>只捡失败落定的</b>（FAILED 或无 status 的老数据行）。PUBLISHED / PROCESSING / RESUBMITTED
 *       是正在投的，抢过来就是重复消费。
 *   <li><b>只捡够老的</b>（{@code minAge}）。刚失败的下一秒就被重投，等于把一次故障放大成一串。
 *   <li><b>重投有上限</b>（{@code maxAttempts}）。没有上限的话，一个永远失败的监听器会被打成风扇，
 *       把日志和下游一起拖死。超限的留给人工，并且会被指标看见。
 *   <li><b>并发有上限</b>（{@code maxInFlight}）。单实例 {@code fixedDelay} 不重入；多实例靠入口的
 *       {@code JobLock}（PG advisory lock）互斥；单轮重投的条数由 {@code maxInFlight} 封顶。
 * </ul>
 */
@Component
@EnableConfigurationProperties(EventRetryProperties.class)
@ConditionalOnProperty(prefix = "shop.event.retry", name = "enabled", havingValue = "true")
public class EventRetryJob implements ManualJob {

    static final String JOB_NAME = "shop.job.event.retry";

    private static final Logger log = LoggerFactory.getLogger(EventRetryJob.class);

    /** 指标名。盯它就是盯整条事件链路的健康度。 */
    static final String OLDEST_INCOMPLETE_METRIC = "shop.event.oldest_incomplete";

    /** 超限未处理的事件数。它 > 0 就是在喊"需要人"，WARN 日志会随时间滚走，这个数字不会。 */
    static final String EXHAUSTED_METRIC = "shop.event.exhausted";

    private final IncompleteEventPublications incompletePublications;

    private final EventPublicationStore store;

    private final EventRetryProperties properties;

    private final JobLock jobLock;

    public EventRetryJob(
            IncompleteEventPublications incompletePublications,
            EventPublicationStore store,
            EventRetryProperties properties,
            JobLock jobLock,
            MeterRegistry meterRegistry) {
        this.incompletePublications = incompletePublications;
        this.store = store;
        this.properties = properties;
        this.jobLock = jobLock;

        Gauge.builder(OLDEST_INCOMPLETE_METRIC, store, EventPublicationStore::oldestIncompleteAgeSeconds)
                .description("最老未完成事件的年龄（秒）。持续上涨说明有消费者在失败")
                .register(meterRegistry);
        Gauge.builder(EXHAUSTED_METRIC, () -> store.countExhausted(properties.maxAttempts()))
                .description("重投次数耗尽、等人工放行的事件数。大于 0 即需处理")
                .register(meterRegistry);
    }

    @Override
    public String jobName() {
        return JOB_NAME;
    }

    @Override
    @Scheduled(
            fixedDelayString = "${shop.event.retry.interval:PT30S}",
            initialDelayString = "${shop.event.retry.interval:PT30S}")
    public void runNow() {
        jobLock.withLock(JOB_NAME, () -> {
            int candidates = resubmitNow();
            if (candidates > 0) {
                log.info("事件补发：本轮候选 {} 条，最老未完成 {} 秒", candidates, store.oldestIncompleteAgeSeconds());
            }
            warnIfStuck();
            return candidates;
        });
    }

    /**
     * 立刻补发一轮，返回本轮实际重投的条数。
     *
     * <p>单独开这个方法是为了让测试能同步驱动它，不必等定时器。
     *
     * <p><b>为什么不用 {@code ResubmissionOptions} 的限量捞取。</b> 那条路径按 publication_date
     * 最老优先只捞 {@code maxInFlight} 条，预算过滤发生在捞取<b>之后</b>——超限的行被拒掉但名额已经花掉。
     * 一旦库里积满 10 条超限事件（每条都永远修不完，只能人工 requeue），捞取窗口就被它们永久占满，
     * 新失败事件一条也轮不到：整条补发管道饿死。所以这里改走谓词路径全捞（行映射是惰性反序列化，
     * 捞全量只多几次行构造），把四条边界全部放进谓词自己守，语义与旧路径逐条对齐。
     */
    public int resubmitNow() {
        AtomicInteger resubmitted = new AtomicInteger();
        Instant resubmittableBefore = Instant.now().minus(properties.minAge());

        incompletePublications.resubmitIncompletePublications(publication -> {
            // 与 Modulith 自己的 FAILED 捞取条件对齐：只捡失败落定的行，
            // PUBLISHED / PROCESSING / RESUBMITTED 是正在投的，抢过来就是重复消费
            if (!isResubmittable(publication, resubmittableBefore)) {
                return false;
            }
            if (!withinAttemptBudget(publication)) {
                return false;
            }
            return resubmitted.incrementAndGet() <= properties.maxInFlight();
        });
        return resubmitted.get();
    }

    /** 失败落定 = FAILED，或老数据里没有 status 列值的行（Modulith 的捞取 SQL 同样把它们当失败）。 */
    private boolean isResubmittable(EventPublication publication, Instant resubmittableBefore) {
        EventPublication.Status status = publication.getStatus();
        boolean settledAsFailed = status == null || status == EventPublication.Status.FAILED;
        return settledAsFailed && publication.getPublicationDate().isBefore(resubmittableBefore);
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
