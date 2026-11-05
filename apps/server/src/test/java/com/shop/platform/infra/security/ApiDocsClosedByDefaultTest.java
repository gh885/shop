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
 * 接口文档口的关：不带任何开关（生产等价形态）时，文档页与原始 spec 必须 401。
 *
 * <p>开关写反——{@code publicPaths} 在 false 时也把文档路径放行——只有这个默认上下文能抓住；
 * 开关打开后的行为见 {@code ApiDocsExposureTest}。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class ApiDocsClosedByDefaultTest extends IntegrationTest {

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
    void docsAreClosedByDefault() throws Exception {
        assertThat(get("/api-docs.html").statusCode()).isEqualTo(401);
        assertThat(get("/swagger-ui.html").statusCode()).isEqualTo(401);
        assertThat(get("/v3/api-docs").statusCode()).isEqualTo(401);
    }
}
