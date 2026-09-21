package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.shop.platform.testsupport.WebControllerTestSupport;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * OpenAPI 契约回归：运行中的 springdoc 输出必须与仓库里提交的 {@code openapi/api-docs.json} 一致。
 *
 * <p><b>这道闸门替掉了一大批 MockMvc 用例。</b>路由、HTTP 方法、路径/查询参数名与位置、请求体 schema、
 * 成功响应 schema 全在 springdoc 的反射输出里，一次树比对就把 <b>全部</b> 端点钉死——包括那些
 * 根本没有手写用例的端点。而前端 SDK（{@code packages/api}，由 {@code pnpm gen:sdk} 从
 * {@code openapi/api-docs.json} 生成）是照着这份文件编译的：它一漂移，前端类型就与后端契约错位，
 * 却没有任何测试信号。手工用例只覆盖它们各自碰过的路由，且漏掉是没有信号的。
 *
 * <p><b>它替不掉什么</b>（因此那批用例必须保留）：
 * <ul>
 *   <li>4xx/5xx 状态码——springdoc 未注解 {@code @ApiResponse}，spec 里只有 200/201/204，
 *       401/403/404/409/422 的实际状态码只能靠真跑过滤器链与校验器的 MockMvc 用例守；
 *   <li>Cookie 属性（httpOnly/secure/path/maxAge）——spec 不描述；
 *   <li>{@code X-Shop-Id} 成员过滤器、权限拦截器等运行时守卫。
 * </ul>
 *
 * <p>两处刻意的规范化：{@code servers} 由运行端口决定（dev=:8080，测试上下文无固定端口），
 * 属环境而非契约；测试探针控制器已不再注册为 bean，
 * 故无需再排除。
 *
 * <p>比对失败时的修法是唯一的一条：起后端、跑 {@code pnpm gen:sdk} 覆盖 {@code openapi/api-docs.json}。
 * <b>不要</b>为了让它变绿而改本测试——本测试变红意味着线上契约已经变了。
 *
 * <p>与 {@code scripts/check-sdk-drift.sh} 第 2 步的关系：那一步也比对"运行中后端 vs 契约文件"，
 * 但它是 pre-push 里的可选步骤（后端未起则跳过，且可被 {@code LEFTHOOK_EXCLUDE} 整体关掉），
 * 且不在 CI 的 {@code mvn verify} 路径上。本测把同一道闸门搬进必跑的测试期，不依赖任何本地进程，
 * 也没有跳过路径；它不替代那个脚本的另外两件事（SDK 生成物与契约文件同步、真起 dev profile 服务器）。
 */
class ApiDocsContractTest extends WebControllerTestSupport {

    private static final Path COMMITTED_SPEC = Path.of("..", "..", "openapi", "api-docs.json");

    private final ObjectMapper mapper = JsonMapper.builder().build();

    @Test
    void 运行的接口契约_与仓库提交的apiDocs一致() throws Exception {
        JsonNode live = liveSpec();
        JsonNode committed = committedSpec();

        if (!live.equals(committed)) {
            throw new AssertionError(diffHint(live, committed));
        }
    }

    private JsonNode liveSpec() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs"))
                .andReturn()
                .getResponse()
                .getContentAsString(StandardCharsets.UTF_8);
        return normalized(mapper.readTree(body));
    }

    private JsonNode committedSpec() throws IOException {
        assertThat(COMMITTED_SPEC)
                .as("仓库里找不到 %s（本测试假定 working dir = apps/server）", COMMITTED_SPEC.toAbsolutePath())
                .exists();
        return normalized(mapper.readTree(Files.readString(COMMITTED_SPEC, StandardCharsets.UTF_8)));
    }

    private JsonNode normalized(JsonNode spec) {
        // servers 由运行端口决定（dev=:8080，测试上下文无固定端口），属环境而非契约
        ObjectNode copy = ((ObjectNode) spec).deepCopy();
        copy.remove("servers");
        return copy;
    }

    /**
     * 逐路径列出差异——树比对只说 true/false，不给路径就没法修。
     *
     * <p>不用逐行文本 diff：JSON 对象键序一变（springdoc 升级、导出手法不同）整篇都会错位，
     * 满屏噪音却看不到真正改了哪个字段。对象按 key 递归、数组按下标递归，输出 JSON 指针。
     */
    private static String diffHint(JsonNode live, JsonNode committed) {
        List<String> diffs = new ArrayList<>();
        collectDiffs(live, committed, "", diffs);

        StringBuilder sb = new StringBuilder("接口契约与 openapi/api-docs.json 不一致，共 ")
                .append(diffs.size())
                .append(" 处：\n");
        diffs.stream().limit(20).forEach(d -> sb.append("  ").append(d).append('\n'));
        if (diffs.size() > 20) {
            sb.append("  … 另 ").append(diffs.size() - 20).append(" 处\n");
        }
        return sb.append("\n若这是有意的接口变更，起后端跑 `pnpm gen:sdk` 重新导出契约（勿改本测试）。").toString();
    }

    private static void collectDiffs(JsonNode live, JsonNode committed, String path, List<String> out) {
        if (live == null || committed == null) {
            out.add(path + " : " + render(live) + " vs " + render(committed));
            return;
        }
        if (live.isObject() && committed.isObject()) {
            Set<String> keys = new TreeSet<>();
            live.propertyNames().forEach(keys::add);
            committed.propertyNames().forEach(keys::add);
            for (String key : keys) {
                collectDiffs(live.get(key), committed.get(key), path + "/" + key, out);
            }
            return;
        }
        if (live.isArray() && committed.isArray()) {
            if (live.size() != committed.size()) {
                out.add(path + " : 数组长度 " + live.size() + " vs " + committed.size());
            }
            for (int i = 0; i < Math.min(live.size(), committed.size()); i++) {
                collectDiffs(live.get(i), committed.get(i), path + "/" + i, out);
            }
            return;
        }
        if (!live.equals(committed)) {
            out.add(path + " : " + render(live) + " vs " + render(committed));
        }
    }

    private static String render(JsonNode node) {
        if (node == null) {
            return "<缺失>";
        }
        String text = node.isValueNode() ? node.toString() : node.getNodeType().name();
        return text.length() > 60 ? text.substring(0, 60) + "…" : text;
    }
}
