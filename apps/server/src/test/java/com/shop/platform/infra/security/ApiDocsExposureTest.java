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
 * 接口文档口的开，与指标口（{@code MetricsExposureTest}）同一套打法。
 *
 * <p>开关打开时：文档页、Swagger UI、原始 spec 都免登录（本地看文档靠它）；但只放行文档这几条路径，
 * 别的照旧要令牌。默认关闭的反方向见 {@code ApiDocsClosedByDefaultTest}。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "shop.api-docs.public=true")
class ApiDocsExposureTest extends IntegrationTest {

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
    void docsPageSwaggerUiAndRawSpecAreVisibleWhenTheLocalSwitchIsOn() throws Exception {
        HttpResponse<String> spec = get("/v3/api-docs");

        assertThat(spec.statusCode()).isEqualTo(200);
        assertThat(spec.body()).as("拿到的应该是真 spec，不是空 body").contains("openapi");
        assertThat(get("/api-docs.html").statusCode()).isEqualTo(200);
        // swagger-ui.html 本身是 springdoc 的固定 302（跳 index.html），页面本体在 index.html
        assertThat(get("/swagger-ui.html").statusCode()).isEqualTo(302);
        assertThat(get("/swagger-ui/index.html").statusCode()).isEqualTo(200);
    }

    @Test
    void switchingDocsOnDoesNotOpenAnythingElse() throws Exception {
        // 放行只覆盖文档相关路径；指标口（本上下文没开）和 actuator 敏感端点照旧要令牌
        assertThat(get("/actuator/env").statusCode()).isEqualTo(401);
        assertThat(get("/actuator/prometheus").statusCode()).isEqualTo(401);
    }
}
