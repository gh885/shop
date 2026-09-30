package com.shop.platform.infra.observability;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

/** 定时任务入口没有 RequestIdFilter，装饰器要自己把 trace_id/version/env 三件信封补齐。 */
class MdcTaskDecoratorTest {

    @AfterEach
    void cleanMdc() {
        MDC.clear();
    }

    @Test
    void 无父上下文时补齐traceId与日志信封() {
        MdcTaskDecorator decorator = new MdcTaskDecorator("abc1234", "prod");
        AtomicReference<String> traceId = new AtomicReference<>();
        AtomicReference<String> version = new AtomicReference<>();
        AtomicReference<String> env = new AtomicReference<>();

        decorator
                .decorate(() -> {
                    traceId.set(MDC.get("trace_id"));
                    version.set(MDC.get("version"));
                    env.set(MDC.get("env"));
                })
                .run();

        assertThat(traceId.get()).matches("[0-9a-f]{32}");
        assertThat(version.get()).isEqualTo("abc1234");
        assertThat(env.get()).isEqualTo("prod");
    }

    @Test
    void 有父上下文时保留父版本和环境() {
        MdcTaskDecorator decorator = new MdcTaskDecorator("abc1234", "prod");
        MDC.put("trace_id", "parent-trace");
        MDC.put("version", "parent-sha");
        MDC.put("env", "staging");

        AtomicReference<String> version = new AtomicReference<>();
        AtomicReference<String> env = new AtomicReference<>();
        decorator
                .decorate(() -> {
                    version.set(MDC.get("version"));
                    env.set(MDC.get("env"));
                })
                .run();

        assertThat(version.get()).isEqualTo("parent-sha");
        assertThat(env.get()).isEqualTo("staging");
    }
}
