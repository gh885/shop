package com.shop.platform.infra.observability;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

/** MDC 作用域单测：写/回滚语义、条件字段、嵌套作用域下外层值不被破坏。 */
class MdcScopeTest {

    @AfterEach
    void cleanMdc() {
        MDC.clear();
    }

    @Test
    void 成对写入_离开作用域精确回滚() {
        try (MdcScope _ = MdcScope.of("event", "a.failed", "reason", "x")) {
            assertThat(MDC.get("event")).isEqualTo("a.failed");
            assertThat(MDC.get("reason")).isEqualTo("x");
        }
        assertThat(MDC.get("event")).isNull();
        assertThat(MDC.get("reason")).isNull();
    }

    @Test
    void 值为null的键_跳过不写() {
        try (MdcScope _ = MdcScope.of("event", "a.failed", "user_id", null)) {
            assertThat(MDC.get("event")).isEqualTo("a.failed");
            assertThat(MDC.get("user_id")).isNull();
        }
    }

    @Test
    void 条件字段用put_链式追加() {
        try (MdcScope scope = MdcScope.of("event", "a.failed")) {
            scope.put("user_id", "u-1");
            assertThat(MDC.get("user_id")).isEqualTo("u-1");
        }
        assertThat(MDC.get("user_id")).isNull();
    }

    @Test
    void 嵌套作用域_外层值在回滚后恢复() {
        MDC.put("trace_id", "outer");
        try (MdcScope _ = MdcScope.of("trace_id", "inner")) {
            assertThat(MDC.get("trace_id")).isEqualTo("inner");
        }
        // 恢复而非清空：RequestIdFilter 的链路 id 不能被业务日志作用域冲掉
        assertThat(MDC.get("trace_id")).isEqualTo("outer");
        MDC.remove("trace_id");
    }

    @Test
    void 奇数个参数_拒绝() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> MdcScope.of("a"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
