package com.shop.telemetry.sdk.spring;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 骨架期的默认出口：只打日志，不发网络。
 *
 * <p>存在意义是让接线可跑通、可断言（测试里换成收集实现），而不是"临时方案"——
 * 真正的发送实现属于 M0 落地那一步（{@code io.sentry:sentry} 的 core 只在这一层出现）。
 */
public class LoggingTelemetryErrorReporter implements TelemetryErrorReporter {

    private static final Logger log = LoggerFactory.getLogger(LoggingTelemetryErrorReporter.class);

    @Override
    public void capture(HttpServletRequest request, Throwable failure, int status) {
        log.warn(
                "captured {} {} -> {}",
                request.getMethod(),
                request.getRequestURI(),
                status,
                failure);
    }
}
