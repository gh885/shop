package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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

/**
 * 用**真的 transport**打到本地假 relay，而不是 mock 掉 ITransport。
 *
 * <p>理由：这层的事故几乎全在协议接缝上——DSN 解析出的路径对不对、认证头在不在、事件里到底
 * 有什么字段、敏感头有没有漏出去。mock 掉 transport 正好把这层全跳过，而它才是要验的东西。
 */
class SentryTelemetryErrorReporterTest {

    private HttpServer server;
    private final AtomicReference<String> envelope = new AtomicReference<>();
    private final AtomicReference<String> authHeader = new AtomicReference<>();

    @BeforeEach
    void startFakeRelay() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/1/envelope/", exchange -> {
            authHeader.set(exchange.getRequestHeaders().getFirst("X-Sentry-Auth"));
            byte[] raw = exchange.getRequestBody().readAllBytes();
            envelope.set(body(raw, exchange.getRequestHeaders().getFirst("Content-Encoding")));
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

    @Test
    void sendsErrorWithTagsAndWithoutSensitiveHeaders() throws Exception {
        TelemetryErrorReporter reporter =
                SentryTelemetryErrorReporter.init(properties(), request -> Map.of("tenant.id", "t_1001"));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/orders/42");
        request.addHeader("Cookie", "session=super-secret");
        request.addHeader("Authorization", "Bearer super-secret");
        request.addHeader("User-Agent", "junit");
        reporter.capture(request, new IllegalStateException("boom"), 500);

        String body = awaitEnvelope();

        assertNotNull(authHeader.get(), "SDK 必须带 X-Sentry-Auth，DSN 里的 key 就是它");
        assertTrue(body.contains("service.name"), "service.name 是六个强制字段之一");
        assertTrue(body.contains("tenant.id"), "标签必须来自 TelemetryTagContributor");
        assertTrue(body.contains("t_1001"));
        assertTrue(body.contains("IllegalStateException"));
        assertTrue(body.contains("GET /api/orders/:id"), "transaction 必须是模板，不能带订单号 42");
        assertFalse(body.contains("super-secret"), "Cookie / Authorization 绝不能出现在事件里");
    }

    /** 只有状态码、没有异常对象（被框架吞掉的 5xx）也必须能上报。 */
    @Test
    void sendsMessageWhenOnlyStatusIsKnown() throws Exception {
        TelemetryErrorReporter reporter = SentryTelemetryErrorReporter.init(properties(), request -> Map.of());

        reporter.capture(new MockHttpServletRequest("POST", "/api/checkout"), null, 502);

        String body = awaitEnvelope();

        assertTrue(body.contains("http.status_code"));
        assertTrue(body.contains("502"));
        assertTrue(body.contains("POST /api/checkout"));
    }

    private TelemetrySdkProperties properties() {
        return new TelemetrySdkProperties(
                "dev-key",
                "http://dev-key@127.0.0.1:" + server.getAddress().getPort() + "/1",
                "api",
                "api@0.1.0",
                "test",
                0.0);
    }

    private String awaitEnvelope() throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            String body = envelope.get();
            if (body != null) {
                return body;
            }
            Thread.sleep(50);
        }
        fail("5 秒内没收到 envelope：transport 没发出去，或者 DSN 解析出的路径不对");
        return "";
    }

    private static String body(byte[] raw, String contentEncoding) throws IOException {
        if (!"gzip".equalsIgnoreCase(contentEncoding)) {
            return new String(raw, StandardCharsets.UTF_8);
        }
        try (InputStream in = new GZIPInputStream(new ByteArrayInputStream(raw))) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
