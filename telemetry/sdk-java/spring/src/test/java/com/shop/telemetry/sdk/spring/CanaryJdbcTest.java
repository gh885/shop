package com.shop.telemetry.sdk.spring;

import static org.junit.jupiter.api.Assertions.assertTrue;

import io.sentry.Sentry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.HexFormat;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 手动冒烟 3：**真驱动 + 真库**跑一遍 JDBC 挂载点，再从 trace 接口把结果读回来。
 *
 * <p>假 Connection 只能验我们这层代理；真驱动会额外压到 {@code unwrap}/{@code isWrapperFor}、
 * {@code statement.getConnection()}、连接池与我们的代理叠加这些细节——那些正是"本地通过、
 * 上线不灵"的来源。
 *
 * <pre>
 * TELEMETRY_CANARY_DSN=http://dev-public-key@localhost:8090/1 \
 *   mvn -f telemetry/pom.xml test -pl sdk-java/spring -am \
 *   -Dtest=CanaryJdbcTest -Dsurefire.failIfNoSpecifiedTests=false
 * </pre>
 *
 * <p>可选：{@code TELEMETRY_CANARY_PG_URL}（默认 {@code jdbc:postgresql://localhost:15432/shop}）、
 * {@code TELEMETRY_CANARY_API}（默认 {@code http://localhost:8090}）。
 */
@EnabledIfEnvironmentVariable(named = "TELEMETRY_CANARY_DSN", matches = ".+")
class CanaryJdbcTest {

    private static final SecureRandom RANDOM = new SecureRandom();

    @Test
    void recordsRealSqlAsSpanAndReadsItBackFromTraceApi() throws Exception {
        String dsn = System.getenv("TELEMETRY_CANARY_DSN");
        String api = System.getenv().getOrDefault("TELEMETRY_CANARY_API", "http://localhost:8090");
        String pgUrl = System.getenv().getOrDefault("TELEMETRY_CANARY_PG_URL", "jdbc:postgresql://localhost:15432/shop");

        TelemetrySdkProperties properties =
                new TelemetrySdkProperties("dev-public-key", dsn, "api", "api@canary", "dev", 1.0);
        TelemetryErrorReporter reporter = SentryTelemetryErrorReporter.init(properties, request -> Map.of());
        TelemetryWebFilter filter =
                new TelemetryWebFilter(reporter, properties.publicKey(), properties.tracesSampleRate());

        PGSimpleDataSource delegate = new PGSimpleDataSource();
        delegate.setUrl(pgUrl);
        delegate.setUser("shop");
        delegate.setPassword("shop");
        TelemetryDataSource dataSource = new TelemetryDataSource(delegate);

        String traceId = hex(16);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/orders/42");
        request.addHeader("sentry-trace", traceId + "-" + hex(8) + "-1");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {
            try (Connection connection = dataSource.getConnection();
                    PreparedStatement statement = connection.prepareStatement(
                            "SELECT count(*) FROM information_schema.tables WHERE table_schema = ?")) {
                statement.setString(1, "public");
                statement.executeQuery();
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
        });
        Sentry.flush(3000);

        // worker 是异步的：轮询到落库为止，而不是 sleep 一个"应该够"的固定时间
        String trace = awaitTrace(api, traceId);
        assertTrue(trace.contains("\"op\":\"http.server\""), "事务本身要进树：" + trace);
        assertTrue(trace.contains("\"op\":\"db.select\""), "真库上的 SQL 要变成子 span：" + trace);
        assertTrue(
                trace.contains("SELECT count(*) FROM information_schema.tables WHERE table_schema = ?"),
                "description 是带占位符的 SQL 原句（参数值不采）：" + trace);
        assertTrue(trace.contains("\"services\":[\"api\"]"), "服务名来自 server_name：" + trace);
    }

    private static String awaitTrace(String api, String traceId) throws Exception {
        HttpClient client = HttpClient.newHttpClient();
        HttpRequest request = HttpRequest.newBuilder(URI.create(api + "/api/1/traces/" + traceId)).build();
        for (int i = 0; i < 40; i++) {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200 && response.body().contains("db.select")) {
                return response.body();
            }
            Thread.sleep(250);
        }
        throw new AssertionError("10 秒内 trace 接口没出现 db.select：上报链路或建树有问题");
    }

    private static String hex(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        return HexFormat.of().formatHex(buffer);
    }
}
