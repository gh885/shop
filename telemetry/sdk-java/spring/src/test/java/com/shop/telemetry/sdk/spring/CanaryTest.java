package com.shop.telemetry.sdk.spring;

import io.sentry.Sentry;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.mock.web.MockHttpServletRequest;

/**
 * 手动冒烟：往**真实的 relay** 投一条后端错误，用来验证 `SDK → relay → worker → PG` 这半条链。
 *
 * <p>默认跳过（CI 里没有 relay，也不该往别人的机器上灌数据）。跑法：
 *
 * <pre>
 * TELEMETRY_CANARY_DSN=http://dev-public-key@localhost:8090/1 \
 *   mvn -f telemetry/pom.xml test -pl sdk-java/spring -Dtest=CanaryTest -DfailIfNoTests=false
 * </pre>
 */
@EnabledIfEnvironmentVariable(named = "TELEMETRY_CANARY_DSN", matches = ".+")
class CanaryTest {

    @Test
    void sendsOneRealErrorToRelay() {
        String dsn = System.getenv("TELEMETRY_CANARY_DSN");
        TelemetrySdkProperties properties =
                new TelemetrySdkProperties("dev-public-key", dsn, "api", "api@canary", "dev", 1.0);
        TelemetryErrorReporter reporter =
                SentryTelemetryErrorReporter.init(properties, request -> Map.of("tenant.id", "t_1001"));

        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/orders/42");
        request.addHeader("User-Agent", "telemetry-canary");
        reporter.capture(request, new IllegalStateException("canary: 库存扣减失败"), 500);

        // 默认异步发送，进程退出前必须刷出去，否则这条只存在于内存里
        Sentry.flush(3000);
    }
}
