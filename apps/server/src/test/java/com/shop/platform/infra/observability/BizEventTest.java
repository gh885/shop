package com.shop.platform.infra.observability;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

/**
 * 事件出口单测：一行日志同时给出结构化字段与同源的人读文本，且作用域不外泄。
 *
 * <p>message 由字段生成是这里的重点契约——它此前是手写文案，才会出现「字段写 decision、文案打 status」
 * 那种自相矛盾（见 {@link BizEvent} 头注释）。
 */
class BizEventTest {

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
        MDC.clear();
    }

    @Test
    void 字段进MDC且message由同一批字段生成() {
        UUID orderId = UUID.fromString("00000000-0000-0000-0000-000000000001");

        BizEvent.of("order.created")
                .put("order_id", orderId)
                .put("status", "PENDING_PAYMENT")
                .emit();

        var event = onlyEvent();
        assertThat(event.getMDCPropertyMap())
                .containsEntry("event", "order.created")
                .containsEntry("order_id", orderId.toString())
                .containsEntry("status", "PENDING_PAYMENT");
        // 书写次序即输出次序：读日志的人按代码顺序找字段
        assertThat(event.getFormattedMessage())
                .isEqualTo("order.created order_id=" + orderId + " status=PENDING_PAYMENT");
    }

    @Test
    void 值为null的字段既不进MDC也不进message() {
        BizEvent.of("auth.login.failed")
                .put("reason", "user_not_found")
                .put("user_id", null)
                .warn();

        var event = onlyEvent();
        assertThat(event.getMDCPropertyMap()).doesNotContainKey("user_id");
        assertThat(event.getFormattedMessage()).isEqualTo("auth.login.failed reason=user_not_found");
    }

    @Test
    void 数值与枚举直接传入_不必在调用点转字符串() {
        BizEvent.of("http.request")
                .put("status", 503)
                .put("latency_ms", 12L)
                .put("method", "GET")
                .emit();

        assertThat(onlyEvent().getMDCPropertyMap())
                .containsEntry("status", "503")
                .containsEntry("latency_ms", "12")
                .containsEntry("method", "GET");
    }

    @Test
    void 三个终止方法对应三个级别() {
        BizEvent.of("a.happened").emit();
        BizEvent.of("a.degraded").warn();
        BizEvent.of("a.failed").error();

        assertThat(logs.list).extracting(e -> e.getLevel().toString()).containsExactly("INFO", "WARN", "ERROR");
    }

    @Test
    void 带异常的失败事件把cause一起交出去() {
        var boom = new IllegalStateException("渠道拒退");

        BizEvent.of("payment.refund.failed").put("reason", "gateway_rejected").error(boom);

        var event = onlyEvent();
        assertThat(event.getLevel().toString()).isEqualTo("ERROR");
        // logback 把 Throwable 转成 proxy 存进行事件：断 message 而不是 same-as，证明 cause 真被交出
        assertThat(event.getThrowableProxy()).isNotNull();
        assertThat(event.getThrowableProxy().getMessage()).isEqualTo("渠道拒退");
    }

    @Test
    void 打完就把MDC还给外层_不污染同请求的后续日志() {
        MDC.put("trace_id", "outer-trace");

        BizEvent.of("shop_member.phone_revealed").put("member_id", "m-1").emit();

        assertThat(MDC.get("trace_id")).isEqualTo("outer-trace");
        assertThat(MDC.get("event")).isNull();
        assertThat(MDC.get("member_id")).isNull();
    }

    private ILoggingEvent onlyEvent() {
        assertThat(logs.list).hasSize(1);
        return logs.list.getFirst();
    }
}
