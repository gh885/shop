package com.shop.platform.infra.web;

import com.shop.platform.infra.observability.BizEvent;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 每次 HTTP 请求完成后自动打一条结构化日志（事件目录见 docs/conventions/business-event-logging.md）。 路径用路由模板（/orders/:id），非实际
 * URL。
 */
@Component
@RequiredArgsConstructor
public class HttpRequestLoggingInterceptor implements HandlerInterceptor {

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

        BizEvent event = BizEvent.of("http.request")
                .put("method", method)
                .put("path", bestMatchPattern)
                .put("status", status)
                .put("latency_ms", latencyMs)
                .put("client_ip", resolvedIp);
        if (status >= 500) {
            event.error();
        } else {
            event.emit();
        }
    }
}
