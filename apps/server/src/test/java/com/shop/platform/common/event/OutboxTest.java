package com.shop.platform.common.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import com.shop.platform.common.id.Ids;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 验证 outbox 承诺的两件真事：事件登记行和业务写在同一个事务里落地，业务回滚它就跟着没。
 *
 * <p>不是"发出去就完事"——这里断言的是数据库里的行，不是内存里的引用。
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(OutboxTest.RecordingListener.class)
class OutboxTest {

    record OrderPlaced(UUID eventId, String orderNo) implements DomainEvent {}

    static class RecordingListener {

        private final List<UUID> received = new CopyOnWriteArrayList<>();

        List<UUID> received() {
            return received;
        }

        @ApplicationModuleListener
        void on(OrderPlaced event) {
            received.add(event.eventId());
        }
    }

    @Autowired
    private ApplicationEventPublisher publisher;

    @Autowired
    private RecordingListener listener;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Test
    void publicationIsWrittenInsideTheTransactionAndCompletedAfterCommit() {
        UUID eventId = Ids.newId();
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        tx.executeWithoutResult(status -> {
            publisher.publishEvent(new OrderPlaced(eventId, "SO20261020000001"));
            assertThat(countPublications(eventId, false))
                    .as("登记行必须和业务写在同一个事务里，不能等提交后再补")
                    .isEqualTo(1);
        });

        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> {
            assertThat(listener.received()).contains(eventId);
            assertThat(countPublications(eventId, true))
                    .as("消费完成后要写 completion_date")
                    .isEqualTo(1);
        });
    }

    @Test
    void publicationIsDiscardedWhenTheBusinessTransactionRollsBack() {
        UUID eventId = Ids.newId();
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                    publisher.publishEvent(new OrderPlaced(eventId, "SO20261020000002"));
                    throw new IllegalStateException("业务写失败");
                }))
                .isInstanceOf(IllegalStateException.class);

        assertThat(countPublications(eventId, false)).as("业务回滚了，事件不能留下").isZero();
        assertThat(listener.received()).doesNotContain(eventId);
    }

    /** 事件 ID 只出现在序列化后的 JSON 里，所以按子串找。 */
    private int countPublications(UUID eventId, boolean completedOnly) {
        String sql = "SELECT count(*) FROM public.event_publication WHERE serialized_event LIKE ?"
                + (completedOnly ? " AND completion_date IS NOT NULL" : "");
        Integer count = jdbc.queryForObject(sql, Integer.class, "%" + eventId + "%");
        return count == null ? 0 : count;
    }
}
