package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.shop.platform.rum.service.RumEventSink;
import com.shop.platform.rum.service.RumVitals;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * 落点的判据：一条事件最终落在**哪组有界标签**上。
 *
 * <p>为什么从接口测试里搬出来：这几条本来就不依赖 HTTP——它们验的是「客户端给的值怎么变成标签」，
 * 而这件事发生在队列之后。挂在 `RumEventsControllerTest` 里只是借了那个 Spring 上下文，
 * 上下文一借，异步投递就让它们全变成假红。搬成纯单测之后跑得更准也更快。
 *
 * <p>三条口径，每条错了都不报错、只让看板说谎：
 *
 * <ul>
 *   <li>白名单外折成 {@code other} 而不是丢弃——丢了你连「有人在乱发」都看不到；
 *   <li>兜底落在 {@code (app, source, status)} 这组有界标签上——它是升级成 code 的唯一数据源；
 *   <li>指标只放有界标签，句子只进日志。
 * </ul>
 */
class RumEventSinkTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final RumVitals vitals = mock(RumVitals.class);
    private final RumEventSink sink = new RumEventSink(vitals, registry);

    private JsonNode json(String body) {
        return mapper.readTree(body);
    }

    @Test
    void 事件总量按app与kind计数() {
        double before = counter(registry, "shop.rum.events", "app", "web", "kind", "error");

        sink.accept(json("{\"kind\":\"error\",\"name\":\"js_error\"}"), "web");

        assertThat(counter(registry, "shop.rum.events", "app", "web", "kind", "error") - before)
                .isEqualTo(1.0);
    }

    @Test
    void 错误名过白名单_名单外折成other() {
        double before = counter(registry, "shop.rum.errors", "app", "web", "name", "other");

        sink.accept(json("{\"kind\":\"error\",\"name\":\"not-a-name\",\"message\":\"x\"}"), "web");

        assertThat(counter(registry, "shop.rum.errors", "app", "web", "name", "other") - before)
                .isEqualTo(1.0);
    }

    /** 分区键上的 app 已经过了一次白名单，这里再过一次是防御性的：标签值不能信来路 */
    @Test
    void app不在白名单时标签也折成other() {
        double before = counter(registry, "shop.rum.events", "app", "other", "kind", "route");

        sink.accept(json("{\"kind\":\"route\",\"to\":\"/cart\"}"), "not-an-app");

        assertThat(counter(registry, "shop.rum.events", "app", "other", "kind", "route") - before)
                .isEqualTo(1.0);
    }

    /** 兜底事件是这套接收端的**存在理由**：它必须落到 (app, source, status) 这组有界标签上 */
    @Test
    void 文案兜底_落到app_source_status这组有界标签() {
        double before = counter(registry, "shop.rum.fallback", "app", "web", "source", "status", "status", "422");

        sink.accept(
                json("{\"kind\":\"fallback\",\"source\":\"status\",\"status\":422,\"detail\":\"没 code 的中文句\"}"), "web");

        assertThat(counter(registry, "shop.rum.fallback", "app", "web", "source", "status", "status", "422") - before)
                .isEqualTo(1.0);
    }

    /** 状态码是客户端给的：不限域就等于允许对方造出 2^31 个标签值 */
    @Test
    void 状态码越界折成other() {
        double before = counter(registry, "shop.rum.fallback", "app", "web", "source", "detail", "status", "other");

        sink.accept(json("{\"kind\":\"fallback\",\"source\":\"detail\",\"status\":-7}"), "web");

        assertThat(counter(registry, "shop.rum.fallback", "app", "web", "source", "detail", "status", "other") - before)
                .isEqualTo(1.0);
    }

    @Test
    void 性能事件交给vitals_不在落点这层做桶() {
        JsonNode event = json("{\"kind\":\"performance\",\"name\":\"LCP\",\"value\":1200}");

        sink.accept(event, "web");

        verify(vitals).accept(any(), eq("web"));
    }

    @Test
    void 未知kind只计总量_不冒充别的事件() {
        double before = counter(registry, "shop.rum.events", "app", "web", "kind", "other");

        sink.accept(json("{\"kind\":\"not-a-kind\"}"), "web");

        assertThat(counter(registry, "shop.rum.events", "app", "web", "kind", "other") - before)
                .isEqualTo(1.0);
    }

    private static double counter(MeterRegistry registry, String name, String... tags) {
        Counter counter = registry.find(name).tags(tags).counter();
        return counter == null ? 0 : counter.count();
    }
}
