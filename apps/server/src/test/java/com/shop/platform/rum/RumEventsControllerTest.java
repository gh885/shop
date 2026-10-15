package com.shop.platform.rum;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.testsupport.WebControllerTestSupport;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/**
 * 接收端的接口契约：**匿名可达、永远 204、客户端给的一切都过白名单与截断**，
 * 而且它只做到「投进队列」为止。
 *
 * <p>为什么「永远 204」要单独钉：遥测没有重试语义（发送端 `sendBeacon` / `fetch(...).catch(() => {})`
 * 都不看响应），把限流或脏数据做成 429/400 只会让代理与网关日志里出现一堆没人会处理的错误，
 * 而真正的故障被淹在里面。所以**状态码不是这条链路的反馈通道，指标才是**。
 *
 * <p>为什么这里不断言指标：落点是**消费端**的事，投递之后就异步了。那些「白名单折成 other」
 * 「兜底落在哪组标签」的断言搬到了 {@link RumEventSinkTest}——它们本来也不依赖 HTTP，
 * 挂在接口测试里只是借了个上下文。这里验的是接收端自己那两步：**挡掉什么**、**投什么**。
 *
 * <p>投递口是 mock（见 {@code WebControllerTestSupport}），所以整条链路在接口测试里不碰网络。
 * 指标断言读注入的注册表并取**增量**：注册表是进程级的，同一 JVM 里前面用例留下的计数会一直在，
 * 断言绝对值必假红。
 */
class RumEventsControllerTest extends WebControllerTestSupport {

    private static final String URL = "/api/rum/events";

    @Autowired
    private MeterRegistry registry;

    @BeforeEach
    void 清空投递记录() {
        // 基类的 mock 与上下文一起被缓存，上一个用例的投递记录会留到这一个
        clearInvocations(rumEventPublisher);
    }

    @Test
    void 正常一批_204_并按app逐条投递() throws Exception {
        postBatch(
                        """
                [{"kind":"error","app":"web","name":"js_error","message":"boom","route":"/cart"},
                 {"kind":"route","app":"web","to":"/cart"}]
                """)
                .andExpect(status().isNoContent());

        // 一条一条投，不是整批一个消息：队列里的加工单位是事件，整批投会让一条脏数据拖住整批
        ArgumentCaptor<String> bodies = ArgumentCaptor.forClass(String.class);
        verify(rumEventPublisher, times(2)).publish(eq("web"), bodies.capture());
        assertThat(bodies.getAllValues())
                .as("投出去的应该是单条事件的 JSON，不是包着数组的原文")
                .allSatisfy(json -> assertThat(json).startsWith("{"))
                .anySatisfy(json -> assertThat(json).contains("js_error"));
    }

    /**
     * 分区键也过白名单。它进的是**物理资源**（分区）而不是标签——不限域就等于允许客户端
     * 指定任意分区键，那是另一种无界基数。
     */
    @Test
    void 白名单外的app_作为分区键折成other_仍然投递() throws Exception {
        postBatch(
                        """
                [{"kind":"error","app":"not-an-app","name":"js_error","message":"x"}]
                """)
                .andExpect(status().isNoContent());

        verify(rumEventPublisher).publish(eq("other"), anyString());
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
        verify(rumEventPublisher, never()).publish(anyString(), anyString());
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

    /** 数组元素不是对象：跳过那一条，不让它进队列（消费端按对象解析，投过去也是要丢的） */
    @Test
    void 数组里混着非对象元素_只跳过那一条() throws Exception {
        double before = counter("shop.rum.rejected", "reason", "not_object");

        postBatch(
                        """
                [123, {"kind":"error","app":"web","name":"js_error","message":"x"}]
                """)
                .andExpect(status().isNoContent());

        assertThat(counter("shop.rum.rejected", "reason", "not_object") - before)
                .isEqualTo(1.0);
        verify(rumEventPublisher, times(1)).publish(anyString(), anyString());
    }

    /** 发送端用 text/plain 避开 CORS 预检（transport.ts 文件头第 1 条）；不跟着写死会全量 415 */
    @Test
    void 只收textplain() throws Exception {
        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isUnsupportedMediaType());
    }

    private ResultActions postBatch(String body) throws Exception {
        return mockMvc.perform(post(URL).contentType(MediaType.TEXT_PLAIN).content(body));
    }

    private double counter(String name, String... tags) {
        Counter counter = registry.find(name).tags(tags).counter();
        return counter == null ? 0 : counter.count();
    }
}
