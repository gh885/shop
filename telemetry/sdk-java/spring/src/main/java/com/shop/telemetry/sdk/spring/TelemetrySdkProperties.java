package com.shop.telemetry.sdk.spring;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * shop 侧接入配置。
 *
 * @param publicKey DSN 的公开 key（公开标识符，不保密），决定链路头里带哪个项目
 * @param dsn 完整 DSN，形如 {@code http://<publicKey>@<relay host>/<projectId>}；
 *     **它才是发送目标**，为空时退化成只打日志（本地/CI 默认就是空）
 * @param serviceName 实体树上的名字（{@code web} / {@code api}）；不填时按 {@code unknown} 处理
 * @param release 形如 {@code api@0.1.0}；从构建信息注入，不要手写
 * @param environment dev / staging / prod
 * @param tracesSampleRate 本层"掷骰子"用的采样率（0~1）。**只在请求没有上游决策时生效**：
 *     浏览器带了 {@code sentry-sampled} 就必须跟采，否则链路会断头。0 = 只要错误不要链路
 */
@ConfigurationProperties(prefix = "telemetry.sdk")
public record TelemetrySdkProperties(
        String publicKey,
        String dsn,
        String serviceName,
        String release,
        String environment,
        Double tracesSampleRate) {

    public TelemetrySdkProperties {
        // 配置写错（负数、>1、NaN）不该让进程起不来：夹一下，采集系统自己不能成为故障源
        tracesSampleRate = tracesSampleRate == null || tracesSampleRate.isNaN()
                ? 0.0
                : Math.clamp(tracesSampleRate, 0.0, 1.0);
    }
}
