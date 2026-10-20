package com.shop.platform.infra.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 给每个请求一个可追溯的 id，写进 MDC，并回显在响应头 {@code X-Request-Id}。
 *
 * <p>错误响应里的 {@code requestId} 就从这个 MDC 取。它<b>永远非空</b>——空 requestId 等于这个错误没法追，
 * 用户报障时你只有一句"出错了"。
 *
 * <p>优先用调用方带来的 {@code X-Request-Id}（网关或前端已经有链路时不要打断它），没有就现场生成。
 * 生成值只取 UUID 前 12 位，够用且不占日志宽度。
 *
 * <p>必须在 {@code finally} 里清 MDC：线程池复用，不清就会把上一个请求的 id 带到下一个请求的日志里，
 * 那时候排查方向会被带偏，比没有 id 更糟。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    /** 与 {@code GlobalExceptionHandler} 读的是同一个键。 */
    static final String MDC_KEY = "trace_id";

    static final String HEADER = "X-Request-Id";

    private static final int MAX_LENGTH = 64;

    /** 当前请求的 id；不在请求里（定时任务、测试直接调用）时返回一个临时值，保证非空。 */
    public static String current() {
        String current = MDC.get(MDC_KEY);
        return current != null && !current.isBlank() ? current : "local-" + shortId();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = incoming(request);
        MDC.put(MDC_KEY, requestId);
        response.setHeader(HEADER, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_KEY);
        }
    }

    private static String incoming(HttpServletRequest request) {
        String header = request.getHeader(HEADER);
        if (header != null && !header.isBlank()) {
            String trimmed = header.trim();
            // 调用方带来的值会被写进日志和响应头，长度和字符都要收一下
            return trimmed.length() > MAX_LENGTH ? trimmed.substring(0, MAX_LENGTH) : trimmed;
        }
        return shortId();
    }

    private static String shortId() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}
