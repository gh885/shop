package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.shop.platform.rum.service.RumEventArchive;
import com.shop.platform.rum.service.RumEventSink;
import com.shop.platform.rum.service.RumVitals;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
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
    private final RumEventArchive archive = mock(RumEventArchive.class);
    private final RumEventSink sink = new RumEventSink(vitals, archive, registry);

    private JsonNode json(String body) {
        return mapper.readTree(body);
    }

    /**
     * 每条都落明细，且**在别的事情之前**。顺序不是为了好看：写库失败要抛出去重投，
     * 先记账再写库的话那次重投会把计数多算一遍（理由写在 {@code RumEventSink.accept}）。
     *
     * <p>用 performance 事件是因为它同时会走到 vitals——两者都 mock，才验得动先后。
     */
    @Test
    void 明细先落_再交给别的出口() {
        JsonNode event = json("{\"kind\":\"performance\",\"name\":\"LCP\",\"value\":1200}");

        sink.accept(event, "web");

        InOrder ordered = inOrder(archive, vitals);
        ordered.verify(archive).append(event, "web");
        ordered.verify(vitals).accept(event, "web");
    }

    /** 写库失败必须往外走，不能吞——吞掉的后果是「Redis 抖一下，那批事件静默消失」 */
    @Test
    void 明细写失败时异常往外传() {
        doThrow(new IllegalStateException("db down")).when(archive).append(any(), any());

        assertThatThrownBy(() -> sink.accept(json("{\"kind\":\"error\"}"), "web"))
                .isInstanceOf(IllegalStateException.class);
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
