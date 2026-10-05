package com.shop.platform.infra.web;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.responses.ApiResponses;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI 契约装配。三件事：忽略表登记 + 修正 springdoc 的可空 {@code $ref} 输出 + 失败响应形状。
 *
 * <p><b>① 登记自定义形参注解进忽略表。</b>{@code @CurrentUser UUID userId} 在 springdoc 眼里是个
 * 「没有任何 Spring 注解的裸 UUID 形参」，默认会被当成必填 query 参数写进 {@code /v3/api-docs}
 * ——契约一旦污染，{@code pnpm sdk:gen} 生成的每个受保护端点都会多出一个前端根本无法提供的
 * {@code userId} 入参。这不是文档瑕疵，是会编译失败的类型契约事故。登记必须在 springdoc 扫描之前
 * 发生，故写在静态块里（{@code SpringDocUtils} 是全局单例配置）。
 *
 * <p><b>② 修 {@code @Schema(nullable = true)} 打在 {@code $ref} 类型上的畸形输出。</b>
 * 对非 {@code $ref} 类型 springdoc 输出 {@code type: ["integer","null"]}（正确）；但对 {@code Money}
 * 这类被引用成 {@code $ref} 的类型，输出的是 {@code { "type": "null", "$ref": "…" }} ——在 OpenAPI 3.1
 * 里 {@code type: "null"} 的含义是「这个值必须是 null」，把那句 {@code $ref} 直接否掉了。
 * 生成器只取 {@code $ref}，于是<b>可空字段在 SDK 里变成非空类型</b>：后端真发 null 时响应 zod 校验失败，
 * 而编译期完全看不见，前端按非空读 {@code .amount} 直接崩。
 *
 * <p>改写成 3.1 的规范写法 {@code anyOf: [{ $ref }, { type: "null" }]}。修在契约出口而不是逐字段绕，
 * 是因为它一次覆盖全部同类字段（Money / Address / SkuInfo / CartProductInfo…）；剩下的改正量在消费方，
 * 那些是逐处的、必须逐处想清楚 null 该怎么办的活。
 */
@Configuration(proxyBeanMethods = false)
public class OpenApiConfig {

    static {
        SpringDocUtils.getConfig().addAnnotationsToIgnore(CurrentUser.class, CurrentShop.class, CurrentStaff.class);
    }

    /** 契约出口的最后一道修正：把「可空 + $ref」的畸形表达统一改写掉 */
    @Bean
    OpenApiCustomizer nullableRefCustomizer() {
        return openApi -> {
            if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
                return;
            }
            openApi.getComponents().getSchemas().values().forEach(OpenApiConfig::rewriteNullableRefs);
        };
    }

    /**
     * 契约出口的第三件事：**失败响应形状**（RFC 9457 ProblemDetail + 四格扩展属性）。
     *
     * <p>此前契约里只有 200/201/204，一个 4xx/5xx 都没有：错误体的形状由 {@code GlobalExceptionHandler}
     * 的散文、前端手写的 {@code ApiErrorSchema}、以及若干条逐端点手写的 MockMvc 断言三方各说一遍，
     * 没有任何一处是机器核对的。这里把运行时形状写成契约的书面版本——它<b>不是</b>权威，
     * {@code ErrorResponseContractTest} 拿真实响应与它逐键比对，两边相等才是它成立的条件。
     *
     * <p>两个刻意的选择：
     *
     * <ul>
     *   <li><b>挂 {@code default} 而不是给每个端点列 4xx/5xx。</b>全局异常处理器的实际行为就是「任何
     *       端点、除成功码以外的任何状态码都是这个形状」，逐个列会立刻写出谎话（给 GET 列表挂 409）；
     *   <li><b>{@code code} 是自由 string，不是 enum。</b>错误码的词表、含义与前端 catalog 归
     *       {@code ErrorCodes} 与 {@code ErrorCodeVocabularyTest} 管；把它做成 enum 会让「新增一个码」
     *       从零成本变成必须重生成 SDK，那是拿错工具管错东西。
     * </ul>
     *
     * <p>与 {@link #nullableRefCustomizer()} 不打架：那个只改「{@code $ref} + 可空」的节点，这里用的是
     * {@code type} 数组，两边不重叠，bean 执行顺序因此无所谓。
     */
    @Bean
    OpenApiCustomizer problemResponseCustomizer() {
        return openApi -> {
            if (openApi.getComponents() == null) {
                openApi.setComponents(new Components());
            }
            Components components = openApi.getComponents();
            components.addSchemas("ApiFieldError", apiFieldErrorSchema());
            components.addSchemas("ApiProblem", apiProblemSchema());
            if (openApi.getPaths() == null) {
                return;
            }
            openApi.getPaths().values().forEach(pathItem -> pathItem.readOperations()
                    .forEach(op -> {
                        if (op.getResponses() == null) {
                            op.setResponses(new ApiResponses());
                        }
                        op.getResponses().addApiResponse("default", problemResponse());
                    }));
        };
    }

    /**
     * 失败响应的对外形状。<b>每一格都是实测出来的</b>（起后端 curl 401/404/422 各一发），不是照 RFC 抄的：
     *
     * <ul>
     *   <li>{@code type} 实测**不出现**——Spring 把 {@code about:blank} 省掉了。仍然声明成可选，是为了
     *       Spring 升级后真吐出它时门禁不会误红；
     *   <li>{@code instance} 实测**出现**，由 Spring MVC 从请求 URI 补上，不是我们写的；
     *   <li>{@code requestId} 声明成可空是**保守，不是事实**：实测它总是 32 位 hex——{@code RequestIdFilter}
     *       是 {@code HIGHEST_PRECEDENCE}，入站头不合法就自生成一个，并把整条链包在 {@code MdcScope} 里，
     *       所以请求内的 {@code MDC.get("trace_id")} 不会是 null。不收紧成 required 的理由是不对称的：
     *       契约比实现更严时，真出现一条不经该过滤器的出口，整条错误会过不了前端校验、被降级成通用句，
     *       而那种降级恰好把 401 的真实原因盖掉了；
     *   <li>{@code code} / {@code params} / {@code errors} 是「有则有、无则整个键不在」，所以可选。
     * </ul>
     *
     * <p>只有 {@code status} 与 {@code detail} 是无条件的，其余写成 required 就是撒谎。
     *
     * <p>把「保守」与「事实」分开记：{@code type} 与 {@code requestId} 都声明得比实测宽，但两者都
     * **有生产者**（前者 Spring 条件性省略、后者过滤器总给值），与「声明了一个没人产出的字段」那种
     * 死声明不是一回事——这一轮删掉的 {@code ApiError.title} 才是后者。
     */
    private static Schema<?> apiProblemSchema() {
        Schema<Object> schema = new Schema<>().types(Set.of("object"));
        schema.addProperty("type", typed("string"));
        schema.addProperty("title", typed("string"));
        schema.addProperty("status", typed("integer"));
        schema.addProperty("detail", typed("string"));
        schema.addProperty("instance", typed("string"));
        schema.addProperty("requestId", new Schema<>().types(orderedTypes("string", "null")));
        schema.addProperty("code", typed("string"));
        // 值只收标量三态：catalog 的 {slot} 是字符串插值，对象/数组没有哪句句子能插，且会顺着上报漏成第四种形状
        schema.addProperty(
                "params",
                new Schema<>()
                        .types(orderedTypes("object"))
                        .additionalProperties(new Schema<>().types(orderedTypes("string", "number", "boolean"))));
        schema.addProperty("errors", new Schema<>().types(orderedTypes("array")).items(refTo("ApiFieldError")));
        schema.setRequired(List.of("status", "detail"));
        return schema;
    }

    /**
     * 一条字段级明细。与 {@code packages/common} 的 {@code ApiFieldError} 同形——那边现在退化成
     * 「归一化后的前端形状」，wire 形状的唯一来源是这里。
     */
    private static Schema<?> apiFieldErrorSchema() {
        Schema<Object> schema = new Schema<>().types(Set.of("object"));
        schema.addProperty("field", typed("string"));
        schema.addProperty("message", typed("string"));
        schema.addProperty("value", typed("string"));
        schema.addProperty("rule", typed("string"));
        schema.addProperty("min", typed("integer"));
        schema.addProperty("max", typed("integer"));
        schema.setRequired(List.of("field", "message"));
        return schema;
    }

    /**
     * 单类型 schema。<b>必须走 {@code types}（类型集合），不能用 {@code type(String)}</b>——
     * swagger-models 里 {@code setType} 是废弃字段、不参与序列化，写了会得到一个空的 {@code {}}，
     * 生成器把它读成 {@code z.unknown()}：契约「声明了类型」这件事在 SDK 里整个蒸发。
     *
     * <p>本类已经踩过同一个坑（{@link #toAnyOfNullableRefInPlace} 里的可空标记），那次修的是
     * 「可空分支没了」，这次修的是「类型分支没了」——形状不同，根因是同一个。
     */
    private static Schema<?> typed(String type) {
        return new Schema<>().types(orderedTypes(type));
    }

    /**
     * 多类型 schema 的类型集合。<b>必须有序</b>，所以不能用 {@code Set.of(...)}。
     *
     * <p>理由不是风格：{@code Set.of} 的迭代顺序由「元素哈希 + 每次 JVM 启动随机生成的 SALT」决定，
     * 而类型集合序列化出去是一个 **JSON 数组**——{@code ApiDocsContractTest} 的树比对对对象按键、
     * 对数组**按下标**，于是同一份代码在不同 JVM 里会导出两份「不一致」的契约：门禁随机变红，
     * {@code pnpm sdk:gen} 反复产生假 diff，而两边的代码一个字都没改。
     *
     * <p>为什么此前没暴露：本类唯二的 {@code Set.of} 都是单元素（{@code Set.of("null")} 与
     * {@code Set.of(type)}），顺序无从谈起。这里是第一处多元素类型集合，坑才现形。
     * 顺带记一条教训：那时用「同一个后端进程连导两次、diff 为空」验幂等是不够的——
     * 同一个 JVM 内顺序当然稳定，要换 JVM 才验得到（本类的门禁用例每次 {@code mvn test} 都是新 JVM）。
     */
    private static Set<String> orderedTypes(String first, String... rest) {
        Set<String> types = new LinkedHashSet<>();
        types.add(first);
        types.addAll(List.of(rest));
        return types;
    }

    private static ApiResponse problemResponse() {
        return new ApiResponse()
                .description("失败（RFC 9457 ProblemDetail + code / params / errors 扩展属性）")
                .content(new Content()
                        .addMediaType("application/problem+json", new MediaType().schema(refTo("ApiProblem"))));
    }

    private static Schema<?> refTo(String schemaName) {
        Schema<Object> ref = new Schema<>();
        ref.set$ref("#/components/schemas/" + schemaName);
        return ref;
    }

    /**
     * 把遥测接收端从对外契约里摘掉（`/api/rum/**`）。
     *
     * <p>它是**浏览器遥测接收端**（{@link RumEventsController}），不是给 SDK 用的客户端接口：
     * body 是 `text/plain` 的裸 JSON 数组，springdoc 建模不出来；而它一旦进契约，生成物里就会多出
     * 一个 `RumApi`——那是个没人该调的接口，留着只会让下一个人以为它是公开 API。
     *
     * <p>与「注册 @CurrentUser 进忽略表」是同一类处理：契约文件描述的是**消费方要照它编译的东西**，
     * 不是「这个服务一共有哪些路由」。路由清单另有出口（{@code PermissionVocabularyTest} 扫注解）。
     */
    @Bean
    OpenApiCustomizer rumIngestExcludedCustomizer() {
        return openApi -> {
            if (openApi.getPaths() != null) {
                openApi.getPaths().keySet().removeIf(path -> path.startsWith("/api/rum"));
            }
        };
    }

    /** 深度改写：属性、items、allOf/anyOf/oneOf、additionalProperties 里的同类节点都要过一遍 */
    private static void rewriteNullableRefs(Schema<?> schema) {
        if (schema == null) {
            return;
        }
        // replaceAll 走 entrySet 的 setValue，边遍历边换值是安全的
        if (schema.getProperties() != null) {
            schema.getProperties().replaceAll((name, property) -> rewritten(property));
        }
        if (schema.getItems() != null) {
            rewriteNullableRefs(schema.getItems());
        }
        if (schema.getAdditionalProperties() instanceof Schema<?> extra) {
            rewriteNullableRefs(extra);
        }
        rewriteBranch(schema.getAllOf());
        rewriteBranch(schema.getAnyOf());
        rewriteBranch(schema.getOneOf());

        toAnyOfNullableRefInPlace(schema);
    }

    private static void rewriteBranch(List<Schema> branch) {
        if (branch != null) {
            branch.forEach(OpenApiConfig::rewriteNullableRefs);
        }
    }

    /** 子节点为就地改写，返回自身只为配合 replaceAll 的签名 */
    private static Schema<?> rewritten(Schema<?> schema) {
        rewriteNullableRefs(schema);
        return schema;
    }

    /**
     * 就地改写：保留 description / title / deprecated 等兄弟键，只把 $ref 与 type 挪进 anyOf。
     * 仅在「确实是可空 $ref」且没有既有组合器时动手，避免误伤正常 schema。
     */
    private static void toAnyOfNullableRefInPlace(Schema<?> schema) {
        String ref = schema.get$ref();
        if (ref == null || !nullable(schema)) {
            return;
        }
        if (schema.getAnyOf() != null || schema.getOneOf() != null || schema.getAllOf() != null) {
            return;
        }

        schema.set$ref(null);
        schema.setType(null);
        schema.setTypes(null);

        Schema<Object> target = new Schema<>();
        target.set$ref(ref);
        Schema<Object> nullableMarker = new Schema<>();
        // 必须走 types（单元素集合序列化成 "null"）：setType 是废弃字段，不参与序列化，
        // 写了会得到一个空的 {} 分支，生成器把它读成 unknown —— 比原来更糟
        nullableMarker.setTypes(Set.of("null"));
        schema.setAnyOf(List.of(target, nullableMarker));
    }

    private static boolean nullable(Schema<?> schema) {
        if ("null".equals(schema.getType())) {
            return true;
        }
        Set<String> types = schema.getTypes();
        return types != null && types.contains("null");
    }
}
