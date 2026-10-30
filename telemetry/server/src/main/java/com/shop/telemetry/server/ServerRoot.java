package com.shop.telemetry.server;

import org.springframework.modulith.Modulithic;

/**
 * Modulith 的根：{@code ApplicationModules.of(ServerRoot.class)} 以它的包为边界，
 * 于是 {@code com.shop.telemetry.server} 下的每个直接子包就是一个应用模块。
 *
 * <p>{@code @Modulithic} 只是"模块检索的根类型"标记，**不是** {@code @SpringBootApplication}——
 * 装配在 {@code telemetry-app}，这里只放业务模块。两者分开的意义：模块边界可以脱离
 * Spring 上下文单独验证（{@code ModuleTest} 不需要起容器）。
 */
@Modulithic
public final class ServerRoot {

    private ServerRoot() {}
}
