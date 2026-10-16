package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.shop.platform.rum.processor.RumProcessingChain;
import com.shop.platform.rum.processor.RumProcessor;
import com.shop.platform.rum.service.RumEventConsumer;
import com.shop.platform.rum.service.RumEventSink;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.List;
import java.util.Optional;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 消费端的失败分工：**毒消息吞掉、加工失败往外传**。
 *
 * <p>这是本类唯一需要想清楚的地方，因为两条路的重试代价完全不同：
 *
 * <ul>
 *   <li>解析不了的记录，重试一万次还是解析不了——吞掉并计数，是唯一能让分区继续往前走的选择；
 *   <li>加工失败是下游抖了（Redis 之类），吞掉等于「抖一下、那批事件静默消失」，
 *       而位点要等加工成功才提交，所以传出去交给容器重试**不会丢**。
 * </ul>
 *
 * <p>这两条一旦写反，症状都是静默的：全吞 → 丢了没人知道；全抛 → 一条毒消息把分区堵死。
 */
class RumEventConsumerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final RumEventSink sink = mock(RumEventSink.class);
    private final RumProcessingChain chain = new RumProcessingChain(List.of());
    private final RumEventConsumer consumer = new RumEventConsumer(mapper, chain, sink, new RumCounters(registry));

    private ConsumerRecord<String, String> record(String key, String value) {
        return new ConsumerRecord<>("shop-rum-events", 0, 0L, key, value);
    }

    @Test
    void 正常记录_用消息键当app交给落点() {
        consumer.onEvent(record("seller", "{\"kind\":\"error\",\"name\":\"js_error\"}"));

        verify(sink).accept(any(), eq("seller"));
    }

    /** app 取自消息键而不是事件体内自述——键由接收端定、已过白名单，是分区键；体内那个字段是客户端的话 */
    @Test
    void app取自消息键_体内同名字段不作数() {
        consumer.onEvent(record("admin", "{\"kind\":\"route\",\"app\":\"web\"}"));

        verify(sink).accept(any(), eq("admin"));
    }

    @Test
    void 白名单外的键折成other() {
        consumer.onEvent(record("not-an-app", "{\"kind\":\"route\"}"));

        verify(sink).accept(any(), eq("other"));
    }

    @Test
    void 解析不了的毒消息_吞掉并计数_不交给落点() {
        double before = counter(registry, "shop.rum.rejected", "reason", "bad_body");

        consumer.onEvent(record("web", "<html>not json at all</html>"));

        assertThat(counter(registry, "shop.rum.rejected", "reason", "bad_body") - before)
                .isEqualTo(1.0);
        verify(sink, never()).accept(any(), any());
    }

    @Test
    void 不是对象的记录_吞掉并计数() {
        double before = counter(registry, "shop.rum.rejected", "reason", "not_object");

        consumer.onEvent(record("web", "\"just a string\""));

        assertThat(counter(registry, "shop.rum.rejected", "reason", "not_object") - before)
                .isEqualTo(1.0);
        verify(sink, never()).accept(any(), any());
    }

    /**
     * 加工失败必须往外传。吞掉的后果是「Redis 抖一下，那批事件静默消失」——
     * 而位点还没提交，抛出去才会被重投。
     */
    @Test
    void 加工失败往外传_不吞() {
        doThrow(new IllegalStateException("redis down")).when(sink).accept(any(), any());

        assertThatThrownBy(() -> consumer.onEvent(record("web", "{\"kind\":\"error\"}")))
                .isInstanceOf(IllegalStateException.class);
    }

    /**
     * 认不出的信封**计数但放行**。丢它的代价是「前端先发版、后端后发版」那个窗口里的遥测全没了，
     * 而那个窗口恰恰是正在发布、最需要现场的时候；而 v1 的读法是一组 path() 取值，
     * 多出来的字段本就不影响它读到共享字段。
     */
    @Test
    void 认不出的信封_计数但仍然处理() {
        double before = counter(registry, "shop.rum.rejected", "reason", "schema_unknown");

        consumer.onEvent(record("web", "{\"schema\":\"shop.fe.v9\",\"kind\":\"route\"}"));

        assertThat(counter(registry, "shop.rum.rejected", "reason", "schema_unknown") - before)
                .isEqualTo(1.0);
        verify(sink).accept(any(), eq("web"));
    }

    @Test
    void 信封版本对上时不计数() {
        consumer.onEvent(record("web", "{\"schema\":\"shop.fe.v1\",\"kind\":\"route\"}"));

        assertThat(counter(registry, "shop.rum.rejected", "reason", "schema_unknown"))
                .isZero();
    }

    /** 加工链否决这条时，落点不该被叫到——否则「丢弃」就只是个说法 */
    @Test
    void 被加工链否决时不交给落点() {
        RumEventConsumer vetoing = new RumEventConsumer(
                mapper,
                new RumProcessingChain(List.of(new RumProcessor() {
                    @Override
                    public String name() {
                        return "always-drop";
                    }

                    @Override
                    public Optional<JsonNode> process(JsonNode event) {
                        return Optional.empty();
                    }
                })),
                sink,
                new RumCounters(registry));

        vetoing.onEvent(record("web", "{\"kind\":\"error\"}"));

        verify(sink, never()).accept(any(), any());
    }

    private static double counter(MeterRegistry registry, String name, String... tags) {
        Counter counter = registry.find(name).tags(tags).counter();
        return counter == null ? 0 : counter.count();
    }
}
