package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.IntegrationTest;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * 指标口的开与关。
 *
 * <p>这是个安全开关，两个方向都要测：开着能抓（本地 Prometheus 靠它），关着必须 401（生产的默认）。
 * 只测一边的开关，等于没测——默认值写反了也没有任何东西会响。
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "shop.actuator.metrics-public=true")
class MetricsExposureTest extends IntegrationTest {

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    private HttpResponse<String> get(String path) throws Exception {
        return CLIENT.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    @Test
    void metricsAreScrapeableWhenTheLocalSwitchIsOn() throws Exception {
        HttpResponse<String> response = get("/actuator/prometheus");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).as("抓到的应该是真指标，不是空 body").contains("jvm_");
    }

    @Test
    void switchingMetricsOnDoesNotOpenAnythingElse() throws Exception {
        // 放行是按路径匹配的，不是「放行 /actuator 下所有」——否则 env、beans 这些会跟着漏出去
        assertThat(get("/actuator/env").statusCode()).isEqualTo(401);
        assertThat(get("/actuator/beans").statusCode()).isEqualTo(401);
    }
}
