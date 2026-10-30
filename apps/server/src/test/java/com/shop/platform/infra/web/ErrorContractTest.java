package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PagingRules;
import com.shop.platform.testsupport.IntegrationTest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 错误响应契约。打真实端口，断言的是 wire 上真正发出去的东西——形状、状态码、头。
 *
 * <p>形状是 RFC 9457 {@code ProblemDetail}，扩展属性 {@code code} / {@code errors} / {@code requestId}
 * 由前端契约消费，改一个字段就是契约变更。
 *
 * <p>{@code /probe/**} 用一条单独的过滤器链放行：这个测试关心的是错误形状，不是认证。
 * 认证另有一份 {@code AuthenticationFlowTest} 专门打。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(ErrorContractTest.ProbeController.class)
class ErrorContractTest extends IntegrationTest {

    /** 只匹配 {@code /probe/**} 的放行链，order 排在主链前面。 */
    @TestConfiguration
    static class PermitProbeChain {

        @Bean
        @Order(1)
        SecurityFilterChain probeChain(HttpSecurity http) throws Exception {
            http.securityMatcher("/probe/**")
                    .authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
                    .csrf(AbstractHttpConfigurer::disable);
            return http.build();
        }
    }

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    private HttpResponse<String> send(HttpRequest.Builder builder) throws IOException, InterruptedException {
        return CLIENT.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> get(String path) throws IOException, InterruptedException {
        return send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .GET());
    }

    private HttpResponse<String> post(String path, String json) throws IOException, InterruptedException {
        return send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)));
    }

    @Test
    void businessFailureKeepsItsOwnStatusAndCode() throws Exception {
        HttpResponse<String> response = get("/probe/conflict");

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("\"code\":\"" + ErrorCodes.INSUFFICIENT_STOCK + "\"");
        assertThat(response.body()).contains("\"detail\":\"库存不足\"");
        assertThat(response.headers().firstValue("Cache-Control"))
                .hasValueSatisfying(v -> assertThat(v).isEqualTo("no-store"));
    }

    @Test
    void everyErrorResponseCarriesTheSameRequestIdInBodyAndHeader() throws Exception {
        HttpResponse<String> response = get("/probe/conflict");

        String header = response.headers().firstValue(RequestIdFilter.HEADER).orElse("");
        assertThat(header).as("响应头必须带 requestId").isNotBlank();
        assertThat(response.body()).contains("\"requestId\":\"" + header + "\"");
    }

    @Test
    void validationFailureIs422WithFieldLevelDetails() throws Exception {
        HttpResponse<String> response = post("/probe/validate", "{\"name\":\"\"}");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(response.body()).contains("\"errors\"");
        assertThat(response.body()).contains("\"field\":\"name\"");
        assertThat(response.body()).contains("\"rule\":");
    }

    @Test
    void unexpectedExceptionNeverLeaksInternals() throws Exception {
        HttpResponse<String> response = get("/probe/boom");

        assertThat(response.statusCode()).isEqualTo(500);
        assertThat(response.body()).contains("\"detail\":\"服务器内部错误\"");
        assertThat(response.body())
                .as("堆栈、异常消息、类名一律不许出现在响应里")
                .doesNotContain("hunter2")
                .doesNotContain("IllegalStateException")
                .doesNotContain("java.lang")
                .doesNotContain("ProbeController");
    }

    @Test
    void unknownRouteIs404NotAServerError() throws Exception {
        HttpResponse<String> response = get("/probe/there-is-no-such-route");

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.body()).contains("\"detail\":\"接口不存在\"");
    }

    @Test
    void wrongMethodIs405NotAServerError() throws Exception {
        HttpResponse<String> response = get("/probe/validate");

        assertThat(response.statusCode()).isEqualTo(405);
    }

    /**
     * {@code @RequestParam} 上的约束由 Spring 6.1+ 方法级校验执行，违规走
     * {@code HandlerMethodValidationException}——它必须进统一 422 契约，
     * 而不是落进兜底 500（加这条用例前它就是 500）。
     */
    @Test
    void requestParamConstraintViolationIs422Not500() throws Exception {
        HttpResponse<String> response = get("/probe/page?limit=5000");

        assertThat(response.statusCode()).isEqualTo(422);
        assertThat(response.body()).contains("\"errors\"");
        assertThat(response.body()).contains("\"field\":\"limit\"");
    }

    /** 超过 1MB 的请求体在过滤器层就拒 413，不等 Jackson 解析时才炸。 */
    @Test
    void oversizedBodyIs413FromTheFilterNotLater() throws Exception {
        String junk = "x".repeat(1_048_577);

        HttpResponse<String> response = post("/probe/validate", "{\"name\":\"" + junk + "\"}");

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(response.body()).contains("\"detail\":\"请求体过大\"");
        assertThat(response.headers().firstValue("Cache-Control"))
                .hasValueSatisfying(v -> assertThat(v).isEqualTo("no-store"));
    }

    @RestController
    static class ProbeController {

        @GetMapping("/probe/conflict")
        void conflict() {
            throw BusinessException.conflict(ErrorCodes.INSUFFICIENT_STOCK, "库存不足");
        }

        @GetMapping("/probe/boom")
        void boom() {
            throw new IllegalStateException("数据库密码是 hunter2");
        }

        @GetMapping("/probe/page")
        void page(@Max(PagingRules.MAX_LIMIT) int limit) {}

        @PostMapping("/probe/validate")
        void validate(@Valid @RequestBody Payload payload) {}

        record Payload(@NotBlank String name) {}
    }
}
