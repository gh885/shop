package com.shop.telemetry.server.trace;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.shop.telemetry.server.store.EventRecord;
import com.shop.telemetry.server.store.StoredEvent;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/**
 * 建树是 trace 视图的唯一逻辑，也是最容易出错的地方（环、孤儿、排序）。
 *
 * <p>夹具用真实的三段：浏览器事务 + 浏览器错误 + 后端事务。它们靠三个 id 相连：
 * 浏览器 {@code http.client} span 的 span_id = 后端根 span 的 parent_span_id；
 * 浏览器 {@code ui.render} span 的 span_id = 错误事件的 parent_span_id。
 * 这条链**没有任何服务端猜测**，全是客户端填的。
 */
class TraceTreeBuilderTest {

    private static final String TRACE_ID = "7c9e6679b1a24a3f8e5d0c1b2a394857";

    private final TraceTreeBuilder builder = new TraceTreeBuilder(JsonMapper.builder().build());

    @Test
    void stitchesBrowserAndBackendIntoOneTree() throws IOException {
        TraceGraph graph = builder.build(
                TRACE_ID,
                List.of(
                        stored(1, "event", "javascript", Instant.ofEpochMilli(1_791_234_555_100L), fixture("browser-error.event.json")),
                        stored(2, "transaction", "javascript", Instant.ofEpochMilli(1_791_234_555_000L), fixture("browser-transaction.event.json")),
                        stored(3, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_250L), fixture("java-transaction.event.json"))));

        assertEquals(List.of("web", "api"), graph.services(), "两个服务都识别出来了");
        assertEquals(1, graph.errorCount());
        assertEquals(520, graph.durationMs(), "整条链跨度 = 最后结束 − 最早开始");
        assertEquals(
                List.of(
                        "0 pageload",
                        "1 ui.render",
                        "2 error",
                        "1 http.client",
                        "2 http.server",
                        "3 db.query",
                        "3 serialize.response"),
                graph.spans().stream().map(s -> s.depth() + " " + s.op()).toList(),
                "先序 + 深度就是树；后端根挂在浏览器的 http.client 之下，这才是跨端");

        TraceSpan error = graph.spans().get(2);
        assertEquals("1f2e3d4c5b6a7988", error.parentSpanId(), "错误挂在出错时正在跑的 span 下");
        assertEquals(1L, error.eventId(), "错误节点要能点回事件详情");
        assertEquals(100, error.startedAtMs());

        TraceSpan backendRoot = graph.spans().get(4);
        assertEquals("3c4d5e6f708192a3", backendRoot.parentSpanId());
        assertEquals("api", backendRoot.service());
        assertEquals("POST /api/orders/:id", backendRoot.transaction());
        assertEquals(250, backendRoot.startedAtMs());
    }

    /** 父节点没采到（上一段丢了、或者被保留期清掉了）：提到顶层显示，不丢数据。 */
    @Test
    void orphanBecomesRoot() {
        String payload =
                """
                {"type":"transaction","transaction":"POST /api/orders/:id","start_timestamp":1791234555.25,
                 "timestamp":1791234555.48,
                 "contexts":{"trace":{"trace_id":"%s","span_id":"2b3c4d5e6f708192",
                                      "parent_span_id":"ffffffffffffffff","op":"http.server"}}}
                """
                        .formatted(TRACE_ID);

        TraceGraph graph = builder.build(
                TRACE_ID, List.of(stored(1, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_250L), payload)));

        assertEquals(1, graph.spans().size());
        assertEquals(0, graph.spans().getFirst().depth());
        assertEquals("ffffffffffffffff", graph.spans().getFirst().parentSpanId(), "父 id 原样保留：界面能说清断在哪");
    }

    /**
     * 父子互指是客户端能发出来的东西（伪造或 bug）。递归实现会栈溢出，
     * 而 StackOverflowError 是 Error 不是 Exception——线程直接死，压测时表现为"服务莫名不响应"。
     */
    @Test
    void survivesParentChildCycle() {
        String first =
                """
                {"type":"transaction","transaction":"A","start_timestamp":1791234555.0,"timestamp":1791234555.1,
                 "contexts":{"trace":{"trace_id":"%s","span_id":"aaaaaaaaaaaaaaaa","parent_span_id":"bbbbbbbbbbbbbbbb"}}}
                """
                        .formatted(TRACE_ID);
        String second =
                """
                {"type":"transaction","transaction":"B","start_timestamp":1791234555.2,"timestamp":1791234555.3,
                 "contexts":{"trace":{"trace_id":"%s","span_id":"bbbbbbbbbbbbbbbb","parent_span_id":"aaaaaaaaaaaaaaaa"}}}
                """
                        .formatted(TRACE_ID);

        TraceGraph graph = builder.build(
                TRACE_ID,
                List.of(
                        stored(1, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_000L), first),
                        stored(2, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_200L), second)));

        assertEquals(2, graph.spans().size(), "环里的节点不能消失");
        // 环找不到真正的根，会退化成"从时间最早的节点开始的一条链"——难看，但节点都在、进程没死
        assertEquals(List.of(0, 1), graph.spans().stream().map(TraceSpan::depth).toList());
    }

    /** 同一 span_id 出现两次（重投或客户端复用）不能变成两个节点。 */
    @Test
    void ignoresDuplicateSpanIds() {
        String payload =
                """
                {"type":"transaction","transaction":"A","start_timestamp":1791234555.0,"timestamp":1791234555.1,
                 "contexts":{"trace":{"trace_id":"%s","span_id":"aaaaaaaaaaaaaaaa"}},
                 "spans":[{"span_id":"cccccccccccccccc","parent_span_id":"aaaaaaaaaaaaaaaa",
                           "op":"db.query","description":"select 1",
                           "start_timestamp":1791234555.02,"timestamp":1791234555.05}]}
                """
                        .formatted(TRACE_ID);

        TraceGraph graph = builder.build(
                TRACE_ID,
                List.of(
                        stored(1, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_000L), payload),
                        stored(2, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_000L), payload)));

        assertEquals(2, graph.spans().size());
        assertTrue(graph.spans().stream().anyMatch(span -> "db.query".equals(span.op())));
    }

    /**
     * 后端事务由 sentry-java 产生时**只有 server_name**，没有 tags.service.name。
     * 少了这条兜底，界面上会把后端事件显示成 "java"（技术栈名），而不是服务名。
     */
    @Test
    void derivesServiceFromServerNameForSdkTransactions() {
        String payload =
                """
                {"type":"transaction","transaction":"POST /api/orders/:id","server_name":"api",
                 "platform":"java","start_timestamp":1791234555.25,"timestamp":1791234555.48,
                 "contexts":{"trace":{"trace_id":"%s","span_id":"2b3c4d5e6f708192","op":"http.server"}}}
                """
                        .formatted(TRACE_ID);

        TraceGraph graph = builder.build(
                TRACE_ID, List.of(stored(1, "transaction", "java", Instant.ofEpochMilli(1_791_234_555_250L), payload)));

        assertEquals(List.of("api"), graph.services());
        assertEquals("http.server", graph.spans().getFirst().op());
    }

    @Test
    void emptyWhenNothingMatches() {
        TraceGraph graph = builder.build(TRACE_ID, List.of());

        assertEquals(0, graph.spans().size());
        assertEquals(List.of(), graph.services());
    }

    private static StoredEvent stored(long id, String kind, String platform, Instant occurredAt, String payload) {
        return new StoredEvent(
                id,
                occurredAt.plusSeconds(1),
                null,
                new EventRecord(
                        "1",
                        "%032x".formatted(id),
                        occurredAt,
                        kind,
                        "error".equals(kind) ? "error" : null,
                        platform,
                        "release@1",
                        "dev",
                        "GET /checkout/:step",
                        "t_1001",
                        TRACE_ID,
                        "0000000000000000",
                        null,
                        payload));
    }

    private static String fixture(String name) throws IOException {
        return Files.readString(Path.of("..", "proto", "fixtures", name));
    }
}
