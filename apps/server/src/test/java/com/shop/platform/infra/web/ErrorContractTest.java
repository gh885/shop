package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import jakarta.validation.Valid;
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
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 错误响应契约。打真实端口，断言的是 wire 上真正发出去的东西——形状、状态码、头。
 *
 * <p>形状是 RFC 9457 {@code ProblemDetail}，扩展属性 {@code code} / {@code errors} / {@code requestId}
 * 由前端契约消费，改一个字段就是契约变更。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(ErrorContractTest.ProbeController.class)
class ErrorContractTest {

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

        @PostMapping("/probe/validate")
        void validate(@Valid @RequestBody Payload payload) {}

        record Payload(@NotBlank String name) {}
    }
}
