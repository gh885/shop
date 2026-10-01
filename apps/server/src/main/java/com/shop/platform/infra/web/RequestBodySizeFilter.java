package com.shop.platform.infra.web;

import com.shop.platform.common.BusinessException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 请求体大小上限校验（SEC-04）。 Content-Length > 1MB 直接拒 413，不等到 Jackson 解析时再炸。 注意：Content-Length 不存在时（chunked
 * transfer）会放行，生产环境应在网关层兜底。
 *
 * <p>413 走 {@link FilterExceptionHandler} 转交 MVC 的统一处理器，与两个鉴权过滤器同一条路。
 * 此前它自己 {@code setStatus} + {@code getWriter} 手搓了一份 JSON，代价有三：这一发不在错误契约里
 * （没有 {@code requestId} / {@code instance} / {@code Cache-Control: no-store}），码是小写点分的
 * {@code request.too_large}（不在任何一份词表里，前端 catalog 永远命中不了它，而英文界面会直接
 * 露出那句中文），以及它成了「错误响应只有一个生产者」这条口径的一处例外。
 *
 * <p>「在 Jackson 解析之前掐掉」说的是**位置**，不是**响应写法**——过滤器早于 dispatcher 不等于
 * 不能借用它的异常处理器，{@code JwtAuthFilter}（同样在 dispatcher 之前）一直这么用。
 * 这条由 {@code FilterErrorOutputTest} 钉住：过滤器里出现手写错误体的形状即红。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
@RequiredArgsConstructor
public class RequestBodySizeFilter extends OncePerRequestFilter {

    private static final long MAX_BODY_BYTES = 1_048_576; // 1MB

    private final FilterExceptionHandler exceptionHandler;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long len = request.getContentLengthLong();
        if (len > MAX_BODY_BYTES) {
            exceptionHandler.resolve(request, response, BusinessException.payloadTooLarge("请求体过大"));
            return;
        }
        chain.doFilter(request, response);
    }
}
