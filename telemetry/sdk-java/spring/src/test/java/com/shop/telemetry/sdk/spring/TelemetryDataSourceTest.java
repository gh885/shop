package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import io.sentry.Sentry;
import io.sentry.SpanId;
import io.sentry.TracesSamplingDecision;
import io.sentry.TransactionContext;
import io.sentry.TransactionOptions;
import io.sentry.protocol.SentryId;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import java.util.zip.GZIPInputStream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * JDBC 挂载点。用真 transport 打到假 relay，验的是"树上到底出现了什么"：
 * op 有没有按 SQL 动词分、SQL 原文进没进 description、异常会不会被吞掉。
 *
 * <p>用假的 {@link Connection}（动态代理）而不是 H2：这里要验的是**我们这层代理**的行为，
 * 引一个真库只会把失败原因搅在一起（是代理错了还是驱动错了）。
 */
class TelemetryDataSourceTest {

    private static final String TRACE_ID = "7c9e6679b1a24a3f8e5d0c1b2a394857";

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

    @Test
    void turnsSelectIntoChildSpanWithSqlAsDescription() throws Exception {
        TelemetryDataSource dataSource = dataSource();

        withTransaction(() -> {
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement statement =
                            connection.prepareStatement("SELECT * FROM seller_order WHERE id = ?")) {
                statement.setLong(1, 42);
                statement.executeQuery();
            }
        });
        Sentry.flush(3000);
        String body = awaitEnvelope();

        assertTrue(body.contains("\"op\":\"db.select\""), "SELECT 应该有自己的 op，否则树上分不出读和写");
        assertTrue(body.contains("SELECT * FROM seller_order WHERE id = ?"), "SQL 原文（带占位符）要进 description");
        assertFalse(body.contains("\"42\""), "SQL 的参数不采：里面有手机号、地址、金额");
    }

    /** 写操作要能一眼看出来——排查"谁在写库"全靠这个。 */
    @Test
    void separatesWriteOperationsByVerb() throws Exception {
        TelemetryDataSource dataSource = dataSource();

        withTransaction(() -> {
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement insert = connection.prepareStatement("INSERT INTO seller_order (id) VALUES (?)");
                    PreparedStatement update = connection.prepareStatement("  update seller_order set state = ?");
                    PreparedStatement delete = connection.prepareStatement("DELETE FROM cart")) {
                insert.executeUpdate();
                update.executeUpdate();
                delete.executeUpdate();
            }
        });
        Sentry.flush(3000);
        String body = awaitEnvelope();

        assertTrue(body.contains("\"op\":\"db.insert\""));
        assertTrue(body.contains("\"op\":\"db.update\""));
        assertTrue(body.contains("\"op\":\"db.delete\""));
    }

    /** 采集层绝不能改变异常语义：SQLException 要原样抛给调用方，同时 span 标成出错。 */
    @Test
    void rethrowsOriginalSqlExceptionAndMarksSpanAsFailed() throws Exception {
        TelemetryDataSource dataSource = dataSource();

        SQLException thrown = assertThrows(SQLException.class, () -> withTransaction(() -> {
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement statement = connection.prepareStatement("SELECT broken")) {
                statement.executeQuery();
            }
        }));

        assertEquals("boom", thrown.getMessage(), "必须是原始异常，不能变成包装类");
        Sentry.flush(3000);
        assertTrue(awaitEnvelope().contains("\"status\":\"internal_error\""), "失败的 SQL 要把 span 标成出错");
    }

    /** 没有活动事务时只是直通：没接平台、没采样时 SQL 路径上不能有任何行为变化。 */
    @Test
    void passesThroughWithoutActiveTransaction() throws Exception {
        TelemetryDataSource dataSource = dataSource();

        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement("SELECT 1")) {
            assertNull(statement.executeQuery(), "没有事务时不该改动返回值");
            assertFalse(statement.isClosed(), "没有事务时不该改动状态");
        }
    }

    @Test
    void derivesOperationAndDescription() {
        assertEquals("db.select", TelemetryDataSource.op("  select 1"));
        assertEquals("db.select", TelemetryDataSource.op("WITH x AS (SELECT 1) SELECT * FROM x"));
        assertEquals("db.insert", TelemetryDataSource.op("INSERT INTO t VALUES (1)"));
        assertEquals("db.update", TelemetryDataSource.op("UPDATE t SET a = 1"));
        assertEquals("db.delete", TelemetryDataSource.op("DELETE FROM t"));
        assertEquals("db.query", TelemetryDataSource.op(null));
        assertEquals("statement", TelemetryDataSource.describe(null));
        assertEquals("SELECT a FROM t", TelemetryDataSource.describe("SELECT a\n   FROM t"));
        assertEquals(201, TelemetryDataSource.describe("x".repeat(500)).length(), "超长 SQL 要截断，否则树被挤爆");
    }

    private TelemetryDataSource dataSource() {
        return new TelemetryDataSource(new StubDataSource());
    }

    /** 开一个显式事务并 attach 到当前线程——真实场景里这一步由 filter 做。 */
    private void withTransaction(Body body) throws Exception {
        TelemetrySdkProperties properties = new TelemetrySdkProperties(
                "dev-key",
                "http://dev-key@127.0.0.1:" + server.getAddress().getPort() + "/1",
                "api",
                "api@0.1.0",
                "test",
                1.0);
        SentryTelemetryErrorReporter.init(properties, request -> Map.of());

        TransactionContext context = new TransactionContext(
                new SentryId(TRACE_ID), new SpanId("9a1b0c2d3e4f5061"), null, new TracesSamplingDecision(true, 1.0), null);
        context.setOperation("http.server");
        var transaction = Sentry.startTransaction(context, new TransactionOptions());
        TelemetryTrace.attach(transaction);
        try {
            body.run();
        } finally {
            TelemetryTrace.detach();
            transaction.finish();
        }
    }

    @FunctionalInterface
    private interface Body {
        void run() throws Exception;
    }

    private String awaitEnvelope() throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            String body = envelope.get();
            if (body != null) {
                return body;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("5 秒内没收到 envelope：span 没被上报，或者 transport 没发出去");
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
