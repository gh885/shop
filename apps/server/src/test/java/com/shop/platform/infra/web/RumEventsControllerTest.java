package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.testsupport.WebControllerTestSupport;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Metrics;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

/**
 * 前端遥测接收端的接口契约：匿名可达、永远 204、客户端给的一切都过白名单与截断。
 *
 * <p>为什么「永远 204」要单独钉：遥测没有重试语义（发送端 `sendBeacon` / `fetch(...).catch(() => {})`
 * 都不看响应），把限流或脏数据做成 429/400 只会让代理与网关日志里出现一堆没人会处理的错误，
 * 而真正的故障被淹在里面。所以**状态码不是这条链路的反馈通道，指标才是**。
 *
 * <p>指标断言读全局注册表并取**增量**：`Metrics.globalRegistry` 是进程级的，同一 JVM 里
 * 前面用例留下的计数会一直在，断言绝对值必假红。
 */
class RumEventsControllerTest extends WebControllerTestSupport {

    private static final String URL = "/api/rum/events";

    @Test
    void 正常一批_204_并按白名单落指标() throws Exception {
        double before = counter("shop.rum.events", "app", "web", "kind", "error");

        postBatch(
                        """
                [{"kind":"error","app":"web","name":"js_error","message":"boom","route":"/cart"}]
                """)
                .andExpect(status().isNoContent());

        assertThat(counter("shop.rum.events", "app", "web", "kind", "error") - before)
                .isEqualTo(1.0);
    }

    /** 词表外的一切折成 other，而不是丢弃：丢了你连「有人在乱发」都看不到 */
    @Test
    void 白名单外的app与错误名折成other_仍然计数() throws Exception {
        double before = counter("shop.rum.errors", "app", "other", "name", "other");

        postBatch(
                        """
                [{"kind":"error","app":"not-an-app","name":"not-a-name","message":"x"}]
                """)
                .andExpect(status().isNoContent());

        assertThat(counter("shop.rum.errors", "app", "other", "name", "other") - before)
                .isEqualTo(1.0);
    }

    /** 兜底事件是这套接收端的**存在理由**：它必须落到 (app, source, status) 这组有界标签上 */
    @Test
    void 文案兜底_落到app_source_status这组有界标签() throws Exception {
        double before = counter("shop.rum.fallback", "app", "web", "source", "status", "status", "422");

        postBatch(
                        """
                [{"kind":"fallback","app":"web","source":"status","status":422,"detail":"输入校验失败（3 个字段错误）"}]
                """)
                .andExpect(status().isNoContent());

        assertThat(counter("shop.rum.fallback", "app", "web", "source", "status", "status", "422") - before)
                .isEqualTo(1.0);
    }

    @Test
    void 批量超上限_整批拒收且计入rejected() throws Exception {
        StringBuilder batch = new StringBuilder("[");
        for (int i = 0; i <= RumVocabulary.MAX_BATCH; i++) {
            batch.append(i == 0 ? "" : ",").append("{\"kind\":\"route\",\"app\":\"web\"}");
        }
        batch.append("]");
        double before = counter("shop.rum.rejected", "reason", "batch_too_large");

        postBatch(batch.toString()).andExpect(status().isNoContent());

        assertThat(counter("shop.rum.rejected", "reason", "batch_too_large") - before)
                .isEqualTo(1.0);
    }

    @Test
    void 请求体不是JSON数组_计入rejected且仍然204() throws Exception {
        double before = counter("shop.rum.rejected", "reason", "not_array");

        postBatch("\"just a string\"").andExpect(status().isNoContent());

        assertThat(counter("shop.rum.rejected", "reason", "not_array") - before).isEqualTo(1.0);
    }

    @Test
    void 完全不是JSON_计入rejected且仍然204() throws Exception {
        double before = counter("shop.rum.rejected", "reason", "bad_body");

        postBatch("<html>not json at all</html>").andExpect(status().isNoContent());

        assertThat(counter("shop.rum.rejected", "reason", "bad_body") - before).isEqualTo(1.0);
    }

    /** 发送端用 text/plain 避开 CORS 预检（transport.ts 文件头第 1 条）；不跟着写死会全量 415 */
    @Test
    void 只收textplain() throws Exception {
        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isUnsupportedMediaType());
    }

    private org.springframework.test.web.servlet.ResultActions postBatch(String body) throws Exception {
        return mockMvc.perform(post(URL).contentType(MediaType.TEXT_PLAIN).content(body));
    }

    private static double counter(String name, String... tags) {
        Counter counter = Metrics.globalRegistry.find(name).tags(tags).counter();
        return counter == null ? 0 : counter.count();
    }
}
