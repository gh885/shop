package com.shop.platform.infra.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.shop.platform.testsupport.WebControllerTestSupport;
import org.junit.jupiter.api.Test;

/**
 * 不存在的路由走完全链的形状：匿名白名单按 {@code startsWith} 放行，前缀下面拼错一个尾巴
 * 会过得了认证、又没有 handler，最终落到静态资源处理器抛 {@code NoResourceFoundException}。
 *
 * <p>该异常此前进 {@code Exception} 兜底：客户端打错一个 URL 换来 500 + 一条「未捕获异常」的
 * ERROR 堆栈（本地实测 {@code /api/cms/home-nav}，20 轮收口后启库跑出来的第一个真 bug）。
 * 起真上下文而不是只测 handler：路由→handler 的交接本身也要有人钉。
 */
class UnmappedRouteTest extends WebControllerTestSupport {

    @Test
    void 匿名前缀下不存在的路由_404且不带code() throws Exception {
        mockMvc.perform(get("/api/cms/does-not-exist"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("接口不存在"))
                .andExpect(jsonPath("$.code").doesNotExist())
                .andExpect(jsonPath("$.requestId").exists());
    }

    @Test
    void 受保护前缀下不存在的路由仍先撞认证() throws Exception {
        // 与 GEN-63 那条安全等式对位：白名单外的路径根本到不了 handler，不该由本改动改变
        mockMvc.perform(get("/api/cart/does-not-exist")).andExpect(status().isUnauthorized());
    }
}
