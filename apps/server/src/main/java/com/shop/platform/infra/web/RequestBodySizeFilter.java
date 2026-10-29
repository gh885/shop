package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * 请求体大小上限：Content-Length &gt; 1MB 直接拒 413，不等到 Jackson 解析时再炸。
 * Content-Length 不存在时（chunked transfer）放行，生产环境在网关层兜底。
 *
 * <p>响应不经手写 JSON：抛 {@link BusinessException} 交给 {@link HandlerExceptionResolver}，
 * 落进 {@code GlobalExceptionHandler} 的统一翻译点——requestId、no-store、ProblemDetail 契约
 * 与 MVC 层的错误完全同源。过滤器在 DispatcherServlet 之前，异常到不了 advice，但
 * {@code ExceptionHandlerExceptionResolver} 可以被编程式调用，这是同一条路。
 *
 * <p>413 的唯一出口就是 {@code BusinessException.payloadTooLarge}；之前该工厂已存在但全仓无人抛，
 * 是死代码，本过滤器是它的第一个也是唯一的生产者。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class RequestBodySizeFilter extends OncePerRequestFilter {

    private static final long MAX_BODY_BYTES = 1_048_576; // 1MB

    private final HandlerExceptionResolver exceptionResolver;

    public RequestBodySizeFilter(@Qualifier("handlerExceptionResolver") HandlerExceptionResolver exceptionResolver) {
        this.exceptionResolver = exceptionResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long len = request.getContentLengthLong();
        if (len > MAX_BODY_BYTES) {
            exceptionResolver.resolveException(request, response, null, BusinessException.payloadTooLarge("请求体过大"));
            return;
        }
        chain.doFilter(request, response);
    }
}
