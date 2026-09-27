package com.shop.platform.infra.events;

import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.modulith.events.FailedEventPublications;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 事件登记补发任务：kernel.event_publication 的兜底闭环。
 *
 * <p><b>今天这张表没有任何写入方</b>：全仓八处跨模块监听都是同步同事务的 {@code @EventListener}，
 * Modulith 只为 {@code @ApplicationModuleListener} / {@code @TransactionalEventListener} 登记事件，
 * 所以本任务每轮重投的是空集。它是留给「退款监听改 AFTER_COMMIT + outbox」那一步的兜底
 * （口径见 docs/business-rules/payment.md PAY-33），不是当前链路的组成部分。
 *
 * <p>那一步落地后才有内容：AFTER_COMMIT 监听器的登记与业务同事务落库，提交后进程崩溃会留下
 * 未完成的登记行，消费抛错会标成 FAILED——这里定期重投，配合重启补发
 * （republish-outstanding-events-on-restart）保证 at-least-once。两条重投路径互斥不重复：
 * 卡住的 PUBLISHED / PROCESSING 走 incomplete，消费失败的 FAILED 走 failed。
 */
@Component
@RequiredArgsConstructor
public class EventPublicationRecoveryJob {

    /** 重投间隔 30s；minAge 1 分钟给在途消费留缓冲，不与正常执行竞态 */
    private static final long RESUBMIT_INTERVAL_MS = 30_000;

    private static final Duration RESUBMIT_MIN_AGE = Duration.ofMinutes(1);

    private final IncompleteEventPublications incompletePublications;
    private final FailedEventPublications failedPublications;

    @Scheduled(fixedDelay = RESUBMIT_INTERVAL_MS)
    public void resubmit() {
        // 1. 崩溃孤儿：提交后没来得及消费的 PUBLISHED / 消费中途挂掉的 PROCESSING
        incompletePublications.resubmitIncompletePublicationsOlderThan(RESUBMIT_MIN_AGE);

        // 2. 消费失败：监听器抛异常被标 FAILED 的，退避后重试直至成功
        failedPublications.resubmit(ResubmissionOptions.defaults().withMinAge(RESUBMIT_MIN_AGE));
    }
}
