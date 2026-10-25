package com.shop.platform.infra.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.event.DomainEvent;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.infra.security.ForbiddenException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 管理端事件入口：超限事件在清单里看得见、requeue 清零后补发任务重新捡起、
 * 权限与平台员工身份双向校验。超限用真链路造——监听器一直挂，补发把次数烧完。
 */
@SpringBootTest(
        properties = {
            "shop.event.retry.enabled=true",
            "shop.event.retry.min-age=PT0S",
            "shop.event.retry.max-attempts=2"
        })
@ActiveProfiles("test")
@Import(EventAdminControllerTest.StuckListener.class)
class EventAdminControllerTest {

    record StuckEvent(UUID eventId) implements DomainEvent {}

    static class StuckListener {

        static final AtomicBoolean FAILING = new AtomicBoolean(true);

        static final AtomicInteger DELIVERED = new AtomicInteger();

        @ApplicationModuleListener
        void on(StuckEvent event) {
            if (FAILING.get()) {
                throw new IllegalStateException("下游不可用，用于烧完重投预算");
            }
            DELIVERED.incrementAndGet();
        }
    }

    @Autowired
    private EventAdminController controller;

    @Autowired
    private EventPublicationStore store;

    @Autowired
    private EventRetryProperties retryProperties;

    @Autowired
    private EventRetryJob retryJob;

    @Autowired
    private ApplicationEventPublisher publisher;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @AfterEach
    void resetListener() {
        StuckListener.FAILING.set(true);
    }

    /** 清空登记表：重投按最老优先一批只捞 10 条，库里历次运行遗留的未完成事件会占满名额饿死本用例。 */
    @BeforeEach
    void clearPublications() {
        jdbc.update("DELETE FROM public.event_publication");
    }

    @Test
    void 超限事件在清单里可见_requeue清零后补发重新捡起() {
        UUID eventId = publishEvent();
        UUID publicationId = awaitIncompletePublication(eventId);
        exhaustRetryBudget(publicationId);

        // 超限后补发不再碰它：再跑一轮，尝试次数不动——这就是"卡住"的定义
        Integer attemptsAtLimit = attemptsOf(publicationId);
        retryJob.resubmitNow();
        assertThat(attemptsOf(publicationId)).isEqualTo(attemptsAtLimit);

        // 清单里看得见：id、报文摘要、重投次数都在
        List<EventPublicationStore.IncompleteEvent> listed = new ArrayList<>();
        Authorizer.runAs(operator("staff", "EVENT_REPLAY"), () -> listed.addAll(controller.incomplete()));
        assertThat(listed).anySatisfy(row -> {
            assertThat(row.id()).isEqualTo(publicationId);
            assertThat(row.completionAttempts()).isGreaterThanOrEqualTo(retryProperties.maxAttempts());
            assertThat(row.payloadPreview()).contains(eventId.toString());
        });

        // 放行：计数清零、脱离超限
        Authorizer.runAs(operator("staff", "EVENT_REPLAY"), () -> {
            EventAdminController.Requeued requeued = controller.requeue(publicationId);
            assertThat(requeued.id()).isEqualTo(publicationId);
        });
        assertThat(attemptsOf(publicationId)).isEqualTo(0);

        // 下游恢复后，补发任务（唯一的投递通路）把它跑完，且只跑一次
        StuckListener.FAILING.set(false);
        retryJob.resubmitNow();
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(isCompleted(publicationId)).isTrue());
        int delivered = StuckListener.DELIVERED.get();
        retryJob.resubmitNow();
        assertThat(StuckListener.DELIVERED.get()).isEqualTo(delivered);
    }

    @Test
    void requeue只认未完成的事件() {
        // 不存在的 id：拒
        Authorizer.runAs(
                operator("staff", "EVENT_REPLAY"), () -> assertThatThrownBy(() -> controller.requeue(Ids.newId()))
                        .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                                .isEqualTo(409)));

        // 已完成的事件没有可重放的东西：同样拒
        UUID eventId = publishEvent();
        UUID publicationId = awaitIncompletePublication(eventId);
        StuckListener.FAILING.set(false);
        retryJob.resubmitNow();
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(isCompleted(publicationId)).isTrue());
        Authorizer.runAs(
                operator("staff", "EVENT_REPLAY"), () -> assertThatThrownBy(() -> controller.requeue(publicationId))
                        .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getHttpStatus())
                                .isEqualTo(409)));
    }

    @Test
    void 清单和放行都要平台员工身份加权限点() {
        // 没有身份上下文：拒
        assertThatThrownBy(controller::incomplete).isInstanceOf(ForbiddenException.class);

        // 平台员工缺权限点：拒
        Authorizer.runAs(operator("staff", "JOB_TRIGGER"), () -> assertThatThrownBy(controller::incomplete)
                .isInstanceOf(ForbiddenException.class));

        // 权限点不豁免身份：非员工即使被错授了权限点也拒
        Authorizer.runAs(
                operator("buyer", "EVENT_REPLAY"),
                () -> assertThatThrownBy(() -> controller.requeue(Ids.newId())).isInstanceOf(BusinessException.class));

        // 平台员工带权限点：清单能看
        Authorizer.runAs(operator("staff", "EVENT_REPLAY"), () -> assertThat(controller.incomplete())
                .isNotNull());
    }

    @Test
    void 超限计数只数到预算的() {
        // 没有超限事件时计数为 0，造出一条超限后变正——它是"系统需要人"的直接度量
        UUID eventId = publishEvent();
        UUID publicationId = awaitIncompletePublication(eventId);
        exhaustRetryBudget(publicationId);

        assertThat(store.countExhausted(retryProperties.maxAttempts())).isGreaterThanOrEqualTo(1);
    }

    // —— 种子与工具 ——

    private UUID publishEvent() {
        UUID eventId = Ids.newId();
        new TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> publisher.publishEvent(new StuckEvent(eventId)));
        return eventId;
    }

    private UUID awaitIncompletePublication(UUID eventId) {
        await().atMost(Duration.ofSeconds(10))
                .untilAsserted(() -> assertThat(publicationIdOf(eventId)).isNotNull());
        return publicationIdOf(eventId);
    }

    /** 反复跑补发把重投预算烧完。投递是异步的，每轮之间等它失败落账。 */
    private void exhaustRetryBudget(UUID publicationId) {
        await().atMost(Duration.ofSeconds(20)).untilAsserted(() -> {
            retryJob.resubmitNow();
            assertThat(attemptsOf(publicationId))
                    .as("补发失败应当累计重投次数")
                    .isGreaterThanOrEqualTo(retryProperties.maxAttempts());
        });
    }

    private UUID publicationIdOf(UUID eventId) {
        List<UUID> ids = jdbc.query(
                "SELECT id FROM public.event_publication WHERE serialized_event LIKE ?",
                (rs, i) -> rs.getObject("id", UUID.class),
                "%" + eventId + "%");
        return ids.stream().findFirst().orElse(null);
    }

    private Integer attemptsOf(UUID publicationId) {
        return jdbc.queryForObject(
                "SELECT COALESCE(completion_attempts, 0) FROM public.event_publication WHERE id = ?",
                Integer.class,
                publicationId);
    }

    private boolean isCompleted(UUID publicationId) {
        Integer completed = jdbc.queryForObject(
                "SELECT count(*) FROM public.event_publication WHERE id = ? AND completion_date IS NOT NULL",
                Integer.class,
                publicationId);
        return completed != null && completed > 0;
    }

    private static CurrentOperator operator(String type, String... permissions) {
        return new CurrentOperator(UUID.randomUUID(), type, null, Set.of(), Set.copyOf(List.of(permissions)));
    }
}
