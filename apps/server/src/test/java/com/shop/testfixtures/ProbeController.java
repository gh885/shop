package com.shop.testfixtures;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 过滤链路径测试专用探针（由 {@code FiltersPathNormalizationTest} 经 standaloneSetup 显式登记）。
 *
 * <p><b>为什么在 {@code com.shop.testfixtures} 而不是 {@code com.shop.platform} 下</b>：
 * 本类必须带 {@code @RestController} 才能被 {@code RequestMappingHandlerMapping.isHandler} 识别
 * （Spring Framework 7 只认 {@code @Controller} 一个分支，光有 {@code @RequestMapping} 不算 handler），
 * 而带 stereotype 就会被 {@code @SpringBootTest} 的组件扫描收进上下文——于是 /admin/secret 与
 * /seller/secret 会成为每个全量上下文测试里的真实端点，并混进 {@code /v3/api-docs}，
 * 污染 OpenAPI 契约（见 {@code ApiDocsContractTest}）与启动自检（见 {@code AdminEndpointGuardTest}）。
 * 放在 {@code com.shop.platform} 之外的包，即可两者兼得：能被显式登记，不被扫描。
 *
 * <p>返回的 {@link Probe} 是 wire 形状的载体，测试用 {@code jsonPath("$.ok")} 断言请求确实走到了 handler。
 */
@RestController
public class ProbeController {

    @GetMapping("/admin/secret")
    public Probe ok1() {
        return new Probe();
    }

    @GetMapping("/seller/secret")
    public Probe ok2() {
        return new Probe();
    }

    public record Probe(boolean ok) {
        public Probe() {
            this(true);
        }
    }
}
