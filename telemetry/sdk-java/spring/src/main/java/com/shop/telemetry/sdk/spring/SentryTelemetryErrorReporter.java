package com.shop.telemetry.sdk.spring;

import io.sentry.Sentry;
import io.sentry.SentryEvent;
import io.sentry.SentryLevel;
import io.sentry.SentryOptions;
import io.sentry.protocol.Request;
import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 错误出口的正式实现：把事件交给 {@code io.sentry:sentry} core，由它组 envelope 并发给 relay。
 *
 * <p>分工刻意划在这里：
 *
 * <ul>
 *   <li>**SDK**：envelope 格式、DSN 解析、异步发送、重试、beforeSend 钩子
 *   <li>**本类**：什么算错（由 Filter 传入 status）、transaction 用模板、请求头白名单、
 *       shop 侧标签从 {@link TelemetryTagContributor} 取
 * </ul>
 *
 * <p>为什么不用 {@code sentry-spring-boot-starter}：它把 Filter / ExceptionResolver /
 * TaskDecorator 的实现和 Spring 大版本绑在一起，而 shop 侧跟 Boot 4.x 走。core 是零传递依赖的
 * 纯 Java，正是"不该自己写"的那部分。
 *
 * <p>三个必须显式关掉的默认行为：
 *
 * <ul>
 *   <li>{@code enableUncaughtExceptionHandler = false}：5xx 由我们的 Filter 判定，SDK 再装一个
 *       全局钩子会造成同一异常上报两次（且业务异常会混进来）
 *   <li>{@code tracesSampleRate = 1.0}：**SDK 不参与采样决策**。决策只有一个来源
 *       （{@code TelemetryWebFilter}，它知道上游 baggage 说了什么），这里给 1.0 是为了让
 *       SDK 不再自己掷一次骰子；真实的采样率跟着 TransactionContext 里的 decision 走，
 *       所以事件里的 {@code sample_rate} 仍然是真值
 *   <li>查询串整段不采：里面常带 {@code token}/{@code code}，M2 的参数白名单落地前，宁可不采
 * </ul>
 */
public final class SentryTelemetryErrorReporter implements TelemetryErrorReporter {

    private final String serviceName;
    private final TelemetryTagContributor tags;

    private SentryTelemetryErrorReporter(String serviceName, TelemetryTagContributor tags) {
        this.serviceName = serviceName == null || serviceName.isBlank() ? "unknown" : serviceName;
        this.tags = tags;
    }

    /**
     * 初始化全局 Hub 并返回出口。{@code Sentry.init} 是进程级的，只能调一次——
     * 所以装配点用 {@code @ConditionalOnMissingBean} 保证唯一。
     */
    public static SentryTelemetryErrorReporter init(
            TelemetrySdkProperties properties, TelemetryTagContributor tags) {
        Sentry.init(options(properties));
        return new SentryTelemetryErrorReporter(properties.serviceName(), tags);
    }

    static SentryOptions options(TelemetrySdkProperties properties) {
        SentryOptions options = new SentryOptions();
        options.setDsn(properties.dsn());
        options.setRelease(properties.release());
        options.setEnvironment(properties.environment());
        options.setServerName(properties.serviceName());
        options.setEnableUncaughtExceptionHandler(false);
        options.setSendDefaultPii(false);
        options.setAttachStacktrace(true);
        options.setMaxBreadcrumbs(50);
        options.setTracesSampleRate(1.0);
        options.setShutdownTimeoutMillis(2000);
        // 脱敏规则表（M2）挂在这里；M0 先保证"不采敏感字段"由下面的白名单兜住
        options.setBeforeSend((SentryEvent event, io.sentry.Hint hint) -> event);
        // 排障开关：只影响日志，不影响发送策略。设 TELEMETRY_SDK_DEBUG=1 能看到
        // "发到哪个 URL、服务端回了什么"——采集端不出数时第一个要看的地方。
        options.setDebug(System.getenv("TELEMETRY_SDK_DEBUG") != null);
        return options;
    }

    @Override
    public void capture(HttpServletRequest request, Throwable failure, int status) {
        String transaction = RouteTemplates.of(request);
        Sentry.withScope(scope -> {
            scope.setTag("service.name", serviceName);
            scope.setTag("http.status_code", Integer.toString(status));
            scope.setTransaction(transaction);
            scope.setLevel(SentryLevel.ERROR);
            tags.tags(request).forEach(scope::setTag);
            scope.setRequest(toRequest(request));
            if (failure != null) {
                Sentry.captureException(failure);
            } else {
                // 被框架吞掉的情况：只有状态码，没有异常对象
                Sentry.captureMessage(request.getMethod() + " " + transaction + " -> " + status);
            }
        });
    }

    /** 请求头**白名单**：Cookie / Authorization / X-*（可能带 token）一律不采。 */
    private static Request toRequest(HttpServletRequest request) {
        Request sentryRequest = new Request();
        sentryRequest.setUrl(request.getRequestURL() == null ? null : request.getRequestURL().toString());
        sentryRequest.setMethod(request.getMethod());
        Map<String, String> headers = new LinkedHashMap<>();
        copyHeader(request, headers, "User-Agent");
        copyHeader(request, headers, "Content-Type");
        copyHeader(request, headers, "Accept-Language");
        sentryRequest.setHeaders(headers);
        return sentryRequest;
    }

    private static void copyHeader(
            HttpServletRequest request, Map<String, String> target, String header) {
        String value = request.getHeader(header);
        if (value != null && !value.isBlank()) {
            target.put(header, value);
        }
    }
}
