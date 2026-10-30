package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import com.sun.net.httpserver.HttpServer;
import io.sentry.Sentry;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * transaction 采集。仍然打**真的 transport 到本地假 relay**——这一层要验的正是协议接缝：
 * 事务名是不是模板、parent_span_id 是不是照抄上游头、子 span 有没有进 {@code spans[]}、
 * 回写头里的 span_id 是不是等于事务自己。
 *
 * <p>四种情况各一个用例，覆盖"决策来自哪"这个最容易被写错的分支。
 */
class TelemetryWebFilterTest {

    private static final String TRACE_ID = "7c9e6679b1a24a3f8e5d0c1b2a394857";
    /** 浏览器那条 http.client span：后端事务必须挂在它下面，跨端才算接上。 */
    private static final String PARENT_SPAN_ID = "3c4d5e6f708192a3";

    private HttpServer server;
    private final AtomicReference<String> envelope = new AtomicReference<>();

    @BeforeEach
    void startFakeRelay() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/1/envelope/", exchange -> {
            byte[] raw = exchange.getRequestBody().readAllBytes();
            envelope.set(decode(raw, exchange.getRequestHeaders().getFirst("Content-Encoding")));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopFakeRelay() {
        Sentry.close();
        server.stop(0);
    }

    /** 浏览器带头过来：继承决策 + 继承父节点 + 子 span 进 spans[] + 回写自己的 span。 */
    @Test
    void continuesUpstreamTraceAndSendsChildSpans() throws Exception {
        TelemetryWebFilter filter = filter(0.0, request -> Map.of("tenant.id", "t_1001"));
        MockHttpServletRequest request = request();
        request.addHeader("sentry-trace", TRACE_ID + "-" + PARENT_SPAN_ID + "-1");
        // 注意采样率设成 0：上游说采就必须采，"跟采"这条规则不依赖本层配置
        request.addHeader("baggage", "sentry-trace_id=" + TRACE_ID + ",sentry-sampled=1");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> TelemetryTrace.inSpan(
                "db.query", "SELECT * FROM seller_order WHERE id = ?", () -> null));
        Sentry.flush(3000);
        String body = awaitEnvelope();

        assertTrue(body.contains("\"type\":\"transaction\""), "发出来的应该是 transaction item");
        assertTrue(body.contains(TRACE_ID), "继承上游 trace_id");
        assertTrue(body.contains(PARENT_SPAN_ID), "parent_span_id 必须是上游那个 span，否则跨端断链");
        assertTrue(body.contains("\"op\":\"db.query\""), "子 span 要进 spans[]");
        assertTrue(body.contains("\"transaction\":\"POST /api/orders/:id\""), "事务名必须是模板，不能带 42");
        assertTrue(body.contains("http.response.status_code"));

        String writeBack = response.getHeader("sentry-trace");
        assertNotNull(writeBack, "回写头是下游接上我们的唯一方式");
        String[] parts = writeBack.split("-");
        assertEquals(TRACE_ID, parts[0]);
        assertFalse(PARENT_SPAN_ID.equals(parts[1]), "回写的必须是**本段** span，不是上游的");
        assertTrue(body.contains("\"span_id\":\"" + parts[1] + "\""), "回写的 span_id 必须等于事务自己，"
                + "否则下游会挂到一棵不存在的树上");
    }

    /** 上游明确说不采：一个字节都不该发。 */
    @Test
    void respectsUpstreamNegativeDecision() throws Exception {
        TelemetryWebFilter filter = filter(1.0, request -> Map.of());
        MockHttpServletRequest request = request();
        request.addHeader("sentry-trace", TRACE_ID + "-" + PARENT_SPAN_ID + "-0");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});
        Sentry.flush(1000);

        assertNull(envelope.get(), "上游 sentry-sampled=0 时不能因为本层采样率是 1.0 就自己采");
        assertNotNull(response.getHeader("sentry-trace"), "不采也要回写头：链路 id 要能继续传下去");
        assertTrue(response.getHeader("sentry-trace").endsWith("-0"));
    }

    /** 没有任何头（脚本、健康检查、直接调后端）：按本层采样率自己决定。 */
    @Test
    void rollsOwnDecisionWhenNoUpstreamHeaders() throws Exception {
        TelemetryWebFilter filter = filter(1.0, request -> Map.of());
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request(), response, (req, res) -> {});
        Sentry.flush(3000);
        String body = awaitEnvelope();

        assertTrue(body.contains("\"type\":\"transaction\""));
        assertFalse(body.contains("parent_span_id"), "没有上游就该是根 span");
    }

    /** 4xx 是业务结果：事务照发（耗时仍有价值），但不产生错误事件。 */
    @Test
    void recordsTransactionForClientErrorWithoutCapturingAnError() throws Exception {
        TelemetryWebFilter filter = filter(1.0, request -> Map.of());
        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setStatus(404);

        filter.doFilter(request(), response, (req, res) -> {});
        Sentry.flush(3000);
        String body = awaitEnvelope();

        assertTrue(body.contains("\"type\":\"transaction\""));
        assertTrue(body.contains("\"status\":\"not_found\""), "span 状态要反映 4xx，而不是笼统的 error");
        assertFalse(body.contains("\"type\":\"exception\""), "4xx 不产生错误事件——否则订单校验一抖就刷爆 issue 列表");
    }

    private TelemetryWebFilter filter(double tracesSampleRate, TelemetryTagContributor tags) {
        TelemetrySdkProperties properties = new TelemetrySdkProperties(
                "dev-key",
                "http://dev-key@127.0.0.1:" + server.getAddress().getPort() + "/1",
                "api",
                "api@0.1.0",
                "test",
                tracesSampleRate);
        TelemetryErrorReporter reporter = SentryTelemetryErrorReporter.init(properties, tags);
        return new TelemetryWebFilter(reporter, properties.publicKey(), properties.tracesSampleRate());
    }

    private static MockHttpServletRequest request() {
        return new MockHttpServletRequest("POST", "/api/orders/42");
    }

    private String awaitEnvelope() throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            String body = envelope.get();
            if (body != null) {
                return body;
            }
            Thread.sleep(50);
        }
        fail("5 秒内没收到 envelope：要么事务没被 capture，要么 transport 没发出去");
        return "";
    }

    private static String decode(byte[] raw, String contentEncoding) throws IOException {
        if (!"gzip".equalsIgnoreCase(contentEncoding)) {
            return new String(raw, StandardCharsets.UTF_8);
        }
        try (InputStream in = new GZIPInputStream(new ByteArrayInputStream(raw))) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
