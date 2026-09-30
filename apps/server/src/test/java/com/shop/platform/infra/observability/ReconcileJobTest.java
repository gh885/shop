package com.shop.platform.infra.observability;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.shop.platform.infra.db.ReconcileProbe;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;

/** 对账作业把探针返回的每条差异原样打成 reconcile.mismatch 事件（带检查名和数量）。 */
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
    void 探针返回的差异逐条成事件() {
        ReconcileProbe probe = mock(ReconcileProbe.class);
        when(probe.findMismatches()).thenReturn(List.of(new ReconcileProbe.Mismatch("锁定超时用户券", 1)));

        new ReconcileJob(probe).run();

        assertThat(logs.list).hasSize(1);
        ILoggingEvent event = logs.list.getFirst();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "reconcile.mismatch")
                .containsEntry("check", "锁定超时用户券")
                .containsEntry("count", "1");
    }

    @Test
    void 全绿时不打任何事件() {
        ReconcileProbe probe = mock(ReconcileProbe.class);
        when(probe.findMismatches()).thenReturn(List.of());

        new ReconcileJob(probe).run();

        assertThat(logs.list).isEmpty();
    }
}
