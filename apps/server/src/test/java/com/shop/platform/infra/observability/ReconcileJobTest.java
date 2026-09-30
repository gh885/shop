package com.shop.platform.infra.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/** 对账作业：只对 count > 0 的检查打事件，事件带检查名和数量。 */
class ReconcileJobTest {

    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    private Logger logger;

    @BeforeEach
    void attach() {
        logs.start();
        logger = (Logger) LoggerFactory.getLogger(BizEvent.class);
        logger.addAppender(logs);
    }

    @AfterEach
    void detach() {
        logger.detachAppender(logs);
    }

    @Test
    void 只对不一致的检查打事件() {
        JdbcTemplate jdbcTemplate = mock(JdbcTemplate.class);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class))).thenReturn(0, 1, 0);

        new ReconcileJob(jdbcTemplate).run();

        assertThat(logs.list).hasSize(1);
        ILoggingEvent event = logs.list.getFirst();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "reconcile.mismatch")
                .containsEntry("check", "锁定超时用户券")
                .containsEntry("count", "1");
    }
}
