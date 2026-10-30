package com.shop.platform.infra.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.shop.platform.common.event.DomainEvent;
import com.shop.platform.common.id.Ids;
import com.shop.platform.testsupport.IntegrationTest;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 补发链路：监听器挂了 → 登记停在未完成 → 下游恢复 → 补发把它跑完。
 *
 * <p>不断言「任务被调度了」，只断言数据库里那行的前后状态——那才是这条链路唯一有意义的证据。
 */
@SpringBootTest(
        properties = {
            "shop.event.retry.enabled=true",
            "shop.event.retry.min-age=PT0S",
            "shop.event.retry.max-attempts=5"
        })
@Import(EventRetryJobTest.FlakyListener.class)
class EventRetryJobTest extends IntegrationTest {

    record FlakyEvent(UUID eventId) implements DomainEvent {}

    static class FlakyListener {

        static final AtomicBoolean FAILING = new AtomicBoolean(true);

        static final AtomicInteger DELIVERED = new AtomicInteger();

        @ApplicationModuleListener
        void on(FlakyEvent event) {
            if (FAILING.get()) {
                throw new IllegalStateException("下游暂时不可用");
            }
            DELIVERED.incrementAndGet();
        }
    }

    @Autowired
    private ApplicationEventPublisher publisher;

    @Autowired
    private EventRetryJob retryJob;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void resetListener() {
        FlakyListener.FAILING.set(true);
    }

    /**
     * 清空登记表。重投是按 publication_date 最老优先、一批只捞 {@code maxInFlight} 条——
     * 共享测试库里历次运行留下的未完成事件会占满名额，让本用例刚发的事件永远轮不到，
     * attempts 永远停在 1（库里的坏行是存量污染，不是本次代码的行为）。
     */
    @BeforeEach
    void clearPublications() {
        jdbc.update("DELETE FROM public.event_publication");
    }

    private UUID publishAndFail() {
        UUID eventId = Ids.newId();
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> publisher.publishEvent(new FlakyEvent(eventId)));
        return eventId;
    }

    private boolean isCompleted(UUID eventId) {
        Integer completed = jdbc.queryForObject(
                """
                SELECT count(*) FROM public.event_publication
                WHERE serialized_event LIKE ? AND completion_date IS NOT NULL
                """,
                Integer.class,
                "%" + eventId + "%");
        return completed != null && completed > 0;
    }

    private boolean isRegistered(UUID eventId) {
        Integer total = jdbc.queryForObject(
                "SELECT count(*) FROM public.event_publication WHERE serialized_event LIKE ?",
                Integer.class,
                "%" + eventId + "%");
        return total != null && total > 0;
    }

    @Test
    void aFailedListenerLeavesThePublicationIncomplete() {
        UUID eventId = publishAndFail();

        assertThat(isRegistered(eventId)).as("事件必须落了库，否则补发无从谈起").isTrue();
        assertThat(isCompleted(eventId)).as("监听器抛异常，不能算完成").isFalse();
    }

    @Test
    void resubmissionCompletesThePublicationOnceTheListenerRecovers() {
        UUID eventId = publishAndFail();
        assertThat(isCompleted(eventId)).isFalse();

        FlakyListener.FAILING.set(false);
        retryJob.resubmitNow();

        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() ->
                        assertThat(isCompleted(eventId)).as("补发之后这条登记必须被标完成").isTrue());
    }

    @Test
    void resubmittingAgainDoesNotRedeliverACompletedEvent() {
        UUID eventId = publishAndFail();
        FlakyListener.FAILING.set(false);
        retryJob.resubmitNow();
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(isCompleted(eventId)).isTrue());

        int deliveredAfterFirstSuccess = FlakyListener.DELIVERED.get();
        retryJob.resubmitNow();

        // 已完成的登记不该被再捡起来——重复投递会把下游的幂等压力变成常态
        assertThat(FlakyListener.DELIVERED.get()).isEqualTo(deliveredAfterFirstSuccess);
    }

    @Test
    void anEmptyBacklogIsHarmless() {
        retryJob.resubmitNow();
    }
}
