package com.shop.platform.infra;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 请求体大小上限校验（SEC-04）。
 * Content-Length > 1MB 直接拒 413，不等到 Jackson 解析时再炸。
 * 注意：Content-Length 不存在时（chunked transfer）会放行，生产环境应在网关层兜底。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
public class RequestBodySizeFilter extends OncePerRequestFilter {

    private static final long MAX_BODY_BYTES = 1_048_576; // 1MB

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        long len = request.getContentLengthLong();
        if (len > MAX_BODY_BYTES) {
            response.setStatus(413);
            response.setContentType("application/problem+json");
            response.getWriter().write(
                    "{\"status\":413,\"code\":\"request.too_large\",\"detail\":\"请求体过大\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
