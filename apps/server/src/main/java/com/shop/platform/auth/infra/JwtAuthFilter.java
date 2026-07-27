package com.shop.platform.auth.infra;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.RequestIdFilter;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtProvider jwtProvider;
    private final JwtProperties jwtProperties;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (!contextPath.isEmpty()) {
            path = path.substring(contextPath.length());
        }
        return jwtProperties.getSkipPaths().stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            String header = request.getHeader("Authorization");
            if (header == null || !header.startsWith(BEARER_PREFIX)) {
                writeUnauthorized(request, response, null, "请先登录");
                return;
            }

            String token = header.substring(BEARER_PREFIX.length()).trim();
            Claims claims = jwtProvider.parse(token);

            if (claims == null) {
                writeUnauthorized(request, response, "INVALID_TOKEN", "Token 格式无效");
                return;
            }

            if (!jwtProvider.isAccessToken(claims)) {
                writeUnauthorized(request, response, "INVALID_TOKEN", "Token 类型错误");
                return;
            }

            // VERIFY-01: 校验 audience（手动兜底，配合 JwtProvider 的 requireIssuer）
            if (claims.getAudience() == null
                    || !claims.getAudience().contains(jwtProvider.getExpectedAudience())) {
                writeUnauthorized(request, response, "INVALID_TOKEN", "Token 受众无效");
                return;
            }

            if (jwtProvider.isExpired(claims)) {
                writeUnauthorized(request, response, "TOKEN_EXPIRED", "Token 已过期");
                return;
            }

            UserIdHolder.set(jwtProvider.getUserId(claims));
            chain.doFilter(request, response);
        } finally {
            UserIdHolder.clear();
        }
    }

    private void writeUnauthorized(
            HttpServletRequest request, HttpServletResponse response, String code, String detail)
            throws IOException {
        String requestId = RequestIdFilter.getRequestId(request);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Unauthorized");
        body.put("status", 401);
        body.put("detail", detail);
        if (code != null) {
            body.put("code", code);
        }
        body.put("requestId", requestId);

        response.setStatus(401);
        response.setContentType("application/problem+json");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
