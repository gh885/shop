package com.shop.telemetry.sdk.spring;

import io.sentry.Sentry;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * 手动冒烟 2：让**真 SDK** 产生一条后端事务，并挂到浏览器那条链下面。
 *
 * <p>头上写的 trace_id / parent_span_id 就是 {@code proto/fixtures/browser-transaction.event.json}
 * 里那个 {@code http.client} span——于是这一条事务能和浏览器夹具拼成同一棵树，
 * 用来验"跨端"这半条链在真实 SDK 下成立（夹具模拟上游，SDK 负责本段）。
 *
 * <pre>
 * TELEMETRY_CANARY_DSN=http://dev-public-key@localhost:8090/1 \
 *   mvn -f telemetry/pom.xml test -pl sdk-java/spring -am \
 *   -Dtest=CanaryTraceTest -Dsurefire.failIfNoSpecifiedTests=false
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "TELEMETRY_CANARY_DSN", matches = ".+")
class CanaryTraceTest {

    /** 与浏览器夹具同一条 trace；父 span 是夹具里的 http.client。 */
    private static final String TRACE_ID = "7c9e6679b1a24a3f8e5d0c1b2a394857";

    private static final String BROWSER_FETCH_SPAN = "3c4d5e6f708192a3";

    @Test
    void continuesTheBrowserTrace() throws Exception {
        String dsn = System.getenv("TELEMETRY_CANARY_DSN");
        TelemetrySdkProperties properties =
                new TelemetrySdkProperties("dev-public-key", dsn, "api", "api@canary", "dev", 1.0);
        TelemetryErrorReporter reporter = SentryTelemetryErrorReporter.init(properties, request -> Map.of(
                "tenant.id", "t_1001"));
        TelemetryWebFilter filter =
                new TelemetryWebFilter(reporter, properties.publicKey(), properties.tracesSampleRate());

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/orders/42");
        request.addHeader("sentry-trace", TRACE_ID + "-" + BROWSER_FETCH_SPAN + "-1");
        request.addHeader("baggage", "sentry-trace_id=" + TRACE_ID + ",sentry-sampled=1");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> TelemetryTrace.inSpan(
                "db.query", "SELECT * FROM seller_order WHERE id = ? FOR UPDATE", () -> null));

        Sentry.flush(3000);
        System.out.println("回写 sentry-trace: " + response.getHeader("sentry-trace"));
    }
}
