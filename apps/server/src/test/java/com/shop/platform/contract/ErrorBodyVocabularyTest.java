package com.shop.platform.contract;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 失败响应扩展属性的词表门禁：**源码里写进 ProblemDetail 的每一个键，都必须在契约里声明；
 * 契约里声明的每一个扩展键，都必须真有出口在写**（两向相等）。
 *
 * <p>为什么需要它：{@code code} / {@code params} / {@code errors} / {@code requestId} 这几个键过去
 * 完全住在契约之外，它们的「书面形状」散在三处——{@code GlobalExceptionHandler} 的
 * {@code setProperty("…")} 字面量、前端手写的 {@code ApiErrorSchema}、以及若干条逐端点手写的断言。
 * 三者之间没有任何机器关系：改一处忘另一处，编译过、单测过、接口测试也可能过。
 *
 * <p>N3 把这份形状收进了 {@code components.schemas.ApiProblem}（由 {@code OpenApiConfig} 声明、
 * {@code openapi/api-docs.json} 可见）。这道门禁守的就是「收进去之后不许再各说各话」：
 *
 * <ul>
 *   <li>源码新写一个键而契约没声明 → 红（`schema 没说、运行时却在发`）；
 *   <li>契约声明一个键而没人写 → 红（`schema 说有、运行时永远没有`，调用方按它分支永远拿不到）。
 * </ul>
 *
 * <p>扫描面是**全部** {@code src/main/java}，不只是 {@code GlobalExceptionHandler}：唯一生产者的
 * 事实今天由 {@code FilterExceptionHandler} 的注释维持（过滤器里的异常也回 MVC 的统一处理器），
 * 而那只是一句约定。谁哪天在过滤器里另手搓一份 ProblemDetail，这道门禁会先发现。
 *
 * <p>与相邻两道的关系：{@link ApiDocsContractTest} 管「运行中的 springdoc ⇄ 仓库里的契约文件」；
 * {@link ErrorResponseContractTest} 管「真实响应体 ⇄ 契约声明」；本条管「源码里写的键 ⇄ 契约声明的键」。
 * 三者互不替代——前两者都看不见「某个键声明了但永远没人写」。
 */
@org.junit.jupiter.api.Tag("contract")
class ErrorBodyVocabularyTest {

    /**
     * 匹配 {@code [接收者.]setProperty("键", …)}，键捕获在 group(2)。
     *
     * <p>接收者写成可选：{@code pd.setProperty(…)} 与链式 {@code problem(…).setProperty(…)} 都要扫到——
     * 只认「变量名点 setProperty」会让后者整个溜过去，而那正是「换个写法就绕过门禁」。
     */
    private static final Pattern SET_PROPERTY =
            Pattern.compile("(?:([A-Za-z_$][A-Za-z0-9_$]*)\\.)?setProperty\\(\\s*\"([A-Za-z][A-Za-z0-9]*)\"\\s*,");

    /**
     * 接收者在这个名单里就跳过：{@code System.setProperty} 是 JVM 系统属性，与错误体毫无关系。
     *
     * <p>判据用**接收者**而不是「第二个实参是不是字面量」：后者会漏掉
     * {@code pd.setProperty("newKey", "一句话")} 这种取值是字面量的新扩展键，而漏检是这条门禁
     * 唯一不可接受的失败方向——多扫一个会以「清单多一格」的形式当场红，少扫一个是静默的。
     */
    private static final Set<String> NOT_PROBLEM_DETAIL = Set.of("System");

    /**
     * 由 Spring 自己写、不由本仓库 {@code setProperty} 写的标准字段：
     * {@code title} / {@code status} / {@code detail} 由 {@code ProblemDetail.forStatus} 与手写赋值给出，
     * {@code instance} 由 Spring MVC 从请求 URI 补上（实测 401/404/422 都有它），
     * {@code type} 今天是 {@code about:blank} 且被省略——留着声明只为 Spring 升级后不误红。
     */
    private static final Set<String> WRITTEN_BY_SPRING = Set.of("type", "title", "status", "detail", "instance");

    private static final Path SPEC = SourceScanner.REPO_ROOT.resolve("openapi/api-docs.json");

    @Test
    void 源码写进ProblemDetail的扩展属性_与契约声明两向相等() throws Exception {
        Set<String> written = writtenProblemKeys();
        assertThat(written)
                .as("一个 setProperty(\"…\", …) 都没扫到——扫描正则或生产代码的形状变了，这条门禁已经失明")
                .isNotEmpty();

        Set<String> declaredExtensions = declaredProblemKeys();
        declaredExtensions.removeAll(WRITTEN_BY_SPRING);

        assertThat(written)
                .as("源码 setProperty 写的键与契约 components.schemas.ApiProblem.properties 必须两向相等："
                        + "多写一个就要在 OpenApiConfig 里声明并重跑 pnpm sdk:gen，"
                        + "多声明一个就是「schema 说有、运行时永远没有」")
                .containsExactlyInAnyOrderElementsOf(declaredExtensions);
    }

    @Test
    void 契约的ApiProblem必须存在且带properties() throws Exception {
        JsonNode properties = problemProperties();
        assertThat(properties.isObject() && !properties.isEmpty())
                .as("openapi/api-docs.json 里找不到 components.schemas.ApiProblem.properties；"
                        + "错误响应形状没有被声明进契约（改动是否漏了 OpenApiConfig.problemResponseCustomizer？）")
                .isTrue();
    }

    /** 全部 src/main/java 里 {@code setProperty("…", …)} 的键（跳过 JVM 系统属性那种同名调用），去重排序 */
    private static Set<String> writtenProblemKeys() throws IOException {
        Set<String> keys = new TreeSet<>();
        for (Path file : SourceScanner.javaFiles(SourceScanner.MAIN_JAVA)) {
            Matcher matcher = SET_PROPERTY.matcher(SourceScanner.withoutComments(SourceScanner.read(file)));
            while (matcher.find()) {
                if (NOT_PROBLEM_DETAIL.contains(matcher.group(1))) {
                    continue;
                }
                keys.add(matcher.group(2));
            }
        }
        return keys;
    }

    /** 契约里 {@code ApiProblem.properties} 的键集合（含 Spring 写的标准字段） */
    private static Set<String> declaredProblemKeys() throws IOException {
        Set<String> keys = new TreeSet<>();
        problemProperties().propertyNames().forEach(keys::add);
        return keys;
    }

    private static JsonNode problemProperties() throws IOException {
        JsonNode spec = JsonMapper.builder().build().readTree(Files.readString(SPEC, StandardCharsets.UTF_8));
        return spec.path("components").path("schemas").path("ApiProblem").path("properties");
    }
}
