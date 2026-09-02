package com.shop.platform.infra.web;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

/**
 * Web 层配置（{@code shop.web}）。原先散在 {@code ClientIp} 与 {@code WebMvcConfig} 的两处 {@code @Value}，
 * 收成一份带类型与校验的契约：配置项有了单一真相源，IDE 补全与 {@code spring-configuration-metadata} 也才成立。
 *
 * @param trustForwardedFor 是否信任 X-Forwarded-For 首段作为客户端 IP。默认 false（只信 TCP 对端地址）——
 *     直连部署下盲信该头等于让攻击者每请求换一个「IP」，所有 IP 维度限流整体失效。
 *     仅当部署在会覆写该头的可信反代之后才可置 true。
 * @param corsAllowedOrigins CORS 允许来源。{@code @NotEmpty} 是刻意的：生产漏配时启动即失败，
 *     好过带着 localhost 白名单上线后全站跨域失败（原 {@code @Value} 无默认值的 fail-fast 语义在此保留并升级为可读报错）。
 */
@Validated
@ConfigurationProperties("shop.web")
public record WebProperties(
        @DefaultValue("false") boolean trustForwardedFor, @NotEmpty List<String> corsAllowedOrigins) {}
