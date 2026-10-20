package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.common.id.Ids;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证链路端到端：登录换令牌 → 带令牌访问受保护接口 → 令牌不对被拒。
 *
 * <p>打真实端口，走的是完整的 Spring Security 过滤器链，不是模拟。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(AuthenticationFlowTest.WhoAmIController.class)
class AuthenticationFlowTest {

    private static final String PASSWORD = "correct-horse-battery";

    private static final Pattern ACCESS_TOKEN = Pattern.compile("\"accessToken\"\\s*:\\s*\"([^\"]+)\"");

    private static final HttpClient CLIENT = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    private String loginName;

    private UUID merchantId;

    private void givenAnActiveOperator() {
        merchantId = jdbc.queryForObject(
                "INSERT INTO seller.merchant (name) VALUES (?) RETURNING id", UUID.class, "商家-" + Ids.newId());
        loginName = "login-" + Ids.newId();
        jdbc.update(
                """
                INSERT INTO seller.operator (merchant_id, login_name, password_hash, display_name, is_primary)
                VALUES (?, ?, ?, ?, true)
                """,
                merchantId,
                loginName,
                passwordEncoder.encode(PASSWORD),
                "老板");
    }

    private HttpResponse<String> post(String path, String json) throws IOException, InterruptedException {
        return CLIENT.send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
                        .build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private HttpResponse<String> get(String path, String bearer) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (bearer != null) {
            builder.header("Authorization", "Bearer " + bearer);
        }
        return CLIENT.send(builder.GET().build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    }

    private String login() throws IOException, InterruptedException {
        HttpResponse<String> response =
                post("/api/seller/login", "{\"loginName\":\"" + loginName + "\",\"password\":\"" + PASSWORD + "\"}");
        assertThat(response.statusCode()).as("登录失败: %s", response.body()).isEqualTo(200);
        Matcher matcher = ACCESS_TOKEN.matcher(response.body());
        assertThat(matcher.find()).as("响应里没有 accessToken: %s", response.body()).isTrue();
        return matcher.group(1);
    }

    @Test
    void loginThenCallAProtectedEndpoint() throws Exception {
        givenAnActiveOperator();

        String token = login();
        HttpResponse<String> response = get("/probe/whoami", token);

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains(merchantId.toString());
    }

    @Test
    void protectedEndpointWithoutATokenIs401InOurErrorShape() throws Exception {
        HttpResponse<String> response = get("/probe/whoami", null);

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("\"code\":\"INVALID_TOKEN\"");
        assertThat(response.body()).contains("\"requestId\"");
    }

    @Test
    void wrongPasswordAndUnknownAccountLookIdentical() throws Exception {
        givenAnActiveOperator();

        HttpResponse<String> wrongPassword =
                post("/api/seller/login", "{\"loginName\":\"" + loginName + "\",\"password\":\"nope\"}");
        HttpResponse<String> unknownAccount =
                post("/api/seller/login", "{\"loginName\":\"nobody-" + Ids.newId() + "\",\"password\":\"nope\"}");

        assertThat(wrongPassword.statusCode()).isEqualTo(401);
        assertThat(unknownAccount.statusCode()).isEqualTo(401);
        // requestId 每次不同，比的是除它以外的全部内容
        assertThat(withoutRequestId(wrongPassword.body()))
                .as("两者回同一句话，否则这个匿名接口就是账号枚举器")
                .isEqualTo(withoutRequestId(unknownAccount.body()));
        assertThat(wrongPassword.body()).contains("登录名或密码不正确");
    }

    private static String withoutRequestId(String body) {
        return body.replaceAll("\"requestId\":\"[^\"]*\"", "\"requestId\":\"-\"");
    }

    @Test
    void aTamperedTokenIsRejected() throws Exception {
        givenAnActiveOperator();
        String token = login();
        String tampered = token.substring(0, token.length() - 3) + "abc";

        assertThat(get("/probe/whoami", tampered).statusCode()).isEqualTo(401);
    }

    @Test
    void disabledAccountCannotUseAnAlreadyIssuedToken() throws Exception {
        givenAnActiveOperator();
        String token = login();
        assertThat(get("/probe/whoami", token).statusCode()).isEqualTo(200);

        // 令牌还没过期，但人已经被禁用——必须当场拒，不能等令牌过期
        jdbc.update("UPDATE seller.operator SET status = 'disabled' WHERE login_name = ?", loginName);

        assertThat(get("/probe/whoami", token).statusCode()).isEqualTo(401);
    }

    @RestController
    static class WhoAmIController {

        private final Authorizer authorizer;

        WhoAmIController(Authorizer authorizer) {
            this.authorizer = authorizer;
        }

        @GetMapping("/probe/whoami")
        String whoami() {
            CurrentOperator operator = authorizer.current();
            return operator.operatorId() + "|" + operator.merchantId() + "|"
                    + operator.permissions().size();
        }
    }
}
