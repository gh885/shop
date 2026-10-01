package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.testsupport.SourceScanner;
import com.shop.platform.testsupport.WebControllerTestSupport;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 失败响应的**运行时**契约回归：真实响应体的键集必须落在契约声明的 {@code ApiProblem} 之内，
 * 且契约声明的每一个扩展属性都得真有出口把它发出来。
 *
 * <p>为什么必须是 MockMvc 而不是 {@code GlobalExceptionHandlerTest}：后者直接调 handler 拿
 * {@code ProblemDetail}，看不见 Spring MVC 补上去的那一格（{@code instance} 由 MVC 从请求 URI 写，
 * 实测 401/404/422 都有它），也看不见过滤器链与序列化。走真链才是「用户实际收到的东西」。
 *
 * <p>为什么这三点缺一不可：
 *
 * <ul>
 *   <li><b>键集 ⊆ 声明</b>——运行时多发一个契约没说的键，前端生成的 zod 只会把它剥掉，
 *       看起来「没事」，实际是契约漏了一格；
 *   <li><b>声明 ⊆ 键集</b>——契约声明了一个没有任何出口在发的键，就是「schema 说有、运行时永远没有」。
 *       本仓此前正好有一例：{@code ApiError.title} 声明了但从没人填，调用方按它分支永远拿不到；
 *   <li><b>走真链</b>——只有它能发现「异常处理器写对了、但某个过滤器另发了一份别的形状」。
 * </ul>
 *
 * <p>与相邻几道的关系：{@link ApiDocsContractTest} 管「运行中的 springdoc ⇄ 仓库里的契约文件」；
 * {@link ErrorBodyVocabularyTest} 管「源码里写的键 ⇄ 契约声明的键」（无库、纯扫描，因此连
 * 本地没起数据面时也在跑）；本条管「真实响应体 ⇄ 契约声明」；{@link FilterErrorOutputTest} 管
 * 「拦截链层有没有另写一份响应」（同样无库、纯扫描）。四者的失败面各不相同——本条验的是「形状对」，
 * 那一道验的是「只有这一个出口」。
 */
class ErrorResponseContractTest extends WebControllerTestSupport {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private static final Path SPEC = SourceScanner.REPO_ROOT.resolve("openapi/api-docs.json");

    /**
     * 由 Spring 自己写、不由本仓库 {@code setProperty} 写的标准字段。与
     * {@code ErrorBodyVocabularyTest.WRITTEN_BY_SPRING} 是同一份口径的两个用处：
     * 那边用它算「源码该写的键」，这边用它算「契约该被覆盖的扩展键」。
     */
    private static final Set<String> WRITTEN_BY_SPRING = Set.of("type", "title", "status", "detail", "instance");

    private static final String VALID_ADDRESS =
            """
            {"receiverName":"张三","phone":"13800000000","regionCode":"110100",
             "province":"北京市","city":"北京市","district":"朝阳区","detail":"测试路 1 号"}
            """;

    private static final String INVALID_ADDRESS =
            """
            {"receiverName":"张三","phone":"abc","regionCode":"110100",
             "province":"北京市","city":"北京市","district":"朝阳区","detail":"x"}
            """;

    @Test
    void 每个错误出口的真实响应体_都落在契约声明的ApiProblem之内() throws Exception {
        Set<String> declared = declaredProblemKeys();
        assertThat(declared)
                .as("openapi/api-docs.json 里没有 ApiProblem.properties；本门禁对它要守的东西已经失明")
                .isNotEmpty();

        Set<String> observed = new TreeSet<>();
        for (Map.Entry<String, JsonNode> each : realErrorBodies().entrySet()) {
            Set<String> keys = new TreeSet<>();
            each.getValue().propertyNames().forEach(keys::add);
            assertThat(keys).as("「%s」的响应体出现了契约未声明的键", each.getKey()).isSubsetOf(declared);
            observed.addAll(keys);
        }

        Set<String> declaredExtensions = new TreeSet<>(declared);
        declaredExtensions.removeAll(WRITTEN_BY_SPRING);
        assertThat(observed)
                .as("契约声明了这些扩展属性，但这一组用例没有任何出口真把它发出来：" + "要么某个 handler 丢了那一格，要么契约在声明一个没人发的东西")
                .containsAll(declaredExtensions);
    }

    /**
     * 钉住「过滤器出口」这一发确实是过滤器发的，不是 {@code CurrentUserArgumentResolver} 发的。
     *
     * <p>理由：{@code BearerTokens.verify} 失败时每一支都带码（{@code INVALID_TOKEN} / {@code TOKEN_EXPIRED}，
     * 未携带 token 也归 {@code INVALID_TOKEN}——客户端 401 拦截器按这个码决定要不要刷新重放），
     * 而参数解析器兜住那一支的 code 是 null。所以「code 等于 INVALID_TOKEN」排除了
     * 「畸形 token 被放行给下游、最后由参数解析器兜住」这种假绿。
     *
     * <p>为什么还要断 {@code no-store}：这条链的上半段（过滤器）与下半段（MVC 处理器）是两份代码在写同一个
     * 响应，缓存头正是最容易漏的那一格——漏了就意味着错误响应被中间缓存存下来，下一个请求拿到的可能是别人的 401。
     */
    @Test
    void 畸形token触发的401_带INVALID_TOKEN码且不可缓存() throws Exception {
        MvcResult result = mockMvc.perform(get("/user/addresses").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andReturn();

        JsonNode body = MAPPER.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
        assertThat(body.path("code").asString())
                .as("畸形 token 的 401 没带 INVALID_TOKEN：这一发可能不是过滤器发的（参数解析器兜住时 code 是 null）")
                .isEqualTo(ErrorCodes.INVALID_TOKEN);
        assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL))
                .as("错误响应必须 no-store；过滤器出口若另写了一份响应，丢的就是这个缓存头")
                .contains("no-store");
    }

    /** 一组代表性错误出口：覆盖 401 / 404 / 422 与两条参数通道（params 与 errors） */
    private Map<String, JsonNode> realErrorBodies() throws Exception {
        UUID userId = UUID.randomUUID();
        Map<String, JsonNode> bodies = new LinkedHashMap<>();

        // 401 未登录：不带 Authorization 头，在 JwtAuthFilter 里就失败了（BearerTokens 的 INVALID_TOKEN 那一支）
        bodies.put("401 未登录", body(get("/user/addresses")));

        // 401 畸形 token：同样是过滤器出口，但这一支带 INVALID_TOKEN——「过滤器出口真在发码」的锚点
        bodies.put(
                "401 畸形 token（过滤器出口，INVALID_TOKEN）",
                body(get("/user/addresses").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt")));

        // 404 路由不存在：NoResourceFoundException 那一支
        bodies.put("404 路由不存在", body(get("/api/cms/typo")));

        // 422 校验失败：errors 那一格的出口（FieldValidationErrors 从注解读出 field/rule/min/max）
        bodies.put(
                "422 校验失败",
                body(post("/user/addresses")
                        .with(userAuth(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(INVALID_ADDRESS)));

        // 400 业务拒绝 + params：地址上限那条通道（把只有后端知道的上限当数据出一次）
        when(addressService.create(eq(userId), any()))
                .thenThrow(BusinessException.badRequestWithParams(
                        ErrorCodes.ADDRESS_LIMIT_EXCEEDED, "最多保存 20 条收货地址", Map.of("limit", 20)));
        bodies.put(
                "400 地址上限（params 通道）",
                body(post("/user/addresses")
                        .with(userAuth(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ADDRESS)));

        // 400 业务拒绝 + errors：违禁词那条通道（按字段定位）
        when(addressService.create(eq(userId), any()))
                .thenThrow(BusinessException.badRequest(
                        ErrorCodes.FORBIDDEN_WORD_HIT,
                        "收货地址包含违禁词",
                        List.of(Map.of("field", "detail", "message", "包含违禁词「假货」", "value", "假货"))));
        bodies.put(
                "400 违禁词（errors 通道）",
                body(post("/user/addresses")
                        .with(userAuth(userId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_ADDRESS)));

        return bodies;
    }

    private JsonNode body(MockHttpServletRequestBuilder builder) throws Exception {
        String json = mockMvc.perform(builder).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        return MAPPER.readTree(json);
    }

    private static Set<String> declaredProblemKeys() throws IOException {
        JsonNode spec = MAPPER.readTree(Files.readString(SPEC, StandardCharsets.UTF_8));
        JsonNode properties =
                spec.path("components").path("schemas").path("ApiProblem").path("properties");
        Set<String> keys = new TreeSet<>();
        properties.propertyNames().forEach(keys::add);
        return keys;
    }
}
