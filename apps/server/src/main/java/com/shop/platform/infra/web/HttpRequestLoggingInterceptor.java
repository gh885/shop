package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.slf4j.MDC;
import org.slf4j.event.Level;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 每次 HTTP 请求完成后自动打一条结构化日志（对应 observability-checklist.md EVT-01）。 路径用路由模板（/orders/:id），非实际
 * URL（EVT-02）。
 */
@Component
@RequiredArgsConstructor
public class HttpRequestLoggingInterceptor implements HandlerInterceptor {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger("http.request");

    private final ClientIp clientIp;

    private static final String START_ATTR = "__httpRequestStart__";

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START_ATTR, System.nanoTime());
        return true;
    }

    @Override
    public void afterCompletion(
            HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        long startNanos = (long) request.getAttribute(START_ATTR);
        long latencyMs = (System.nanoTime() - startNanos) / 1_000_000;

        // 路由模板：由 Spring 的 HandlerMapping 解析后挂到 attribute 上
        String bestMatchPattern =
                (String) request.getAttribute("org.springframework.web.servlet.HandlerMapping.bestMatchingPattern");
        if (bestMatchPattern == null) {
            bestMatchPattern = request.getRequestURI();
        }

        String method = request.getMethod();
        int status = response.getStatus();

        // 客户端 IP
        String resolvedIp = clientIp.of(request);

        // 场景字段放 MDC，event 用单独 key
        MDC.put("event", "http.request");
        MDC.put("method", method);
        MDC.put("path", bestMatchPattern);
        MDC.put("status", String.valueOf(status));
        MDC.put("latency_ms", String.valueOf(latencyMs));
        MDC.put("client_ip", resolvedIp);
        try {
            log.atLevel(status >= 500 ? Level.ERROR : Level.INFO)
                    .log("{} {} -> {} ({}ms) client={}", method, bestMatchPattern, status, latencyMs, resolvedIp);
        } finally {
            MDC.remove("event");
            MDC.remove("method");
            MDC.remove("path");
            MDC.remove("status");
            MDC.remove("latency_ms");
            MDC.remove("client_ip");
        }
    }
}
