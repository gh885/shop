package com.shop.platform.auth.infra;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.security.JwtProperties;
import com.shop.platform.infra.security.JwtProvider;
import com.shop.platform.infra.web.UnauthorizedWriter;
import io.jsonwebtoken.Claims;
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
        // /admin/** 走平台员工过滤链（StaffAuthFilter），用户 token 不在此生效
        return jwtProperties.getSkipPaths().stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            String header = request.getHeader("Authorization");
            if (header == null || !header.startsWith(BEARER_PREFIX)) {
                UnauthorizedWriter.write(response, objectMapper, null, "请先登录");
                return;
            }

            String token = header.substring(BEARER_PREFIX.length()).trim();
            Claims claims = jwtProvider.parse(token);

            if (claims == null) {
                UnauthorizedWriter.write(response, objectMapper, "INVALID_TOKEN", "Token 格式无效");
                return;
            }

            if (!jwtProvider.isAccessToken(claims)) {
                UnauthorizedWriter.write(response, objectMapper, "INVALID_TOKEN", "Token 类型错误");
                return;
            }

            // 员工 token（kind=staff）只能在 /admin/** 使用，用户链路拒绝，防止 staff UUID 被当成 userId
            if (jwtProvider.isStaff(claims)) {
                UnauthorizedWriter.write(response, objectMapper, "INVALID_TOKEN", "Token 类型错误");
                return;
            }

            // VERIFY-01: 校验 audience（手动兜底，配合 JwtProvider 的 requireIssuer）
            if (claims.getAudience() == null || !claims.getAudience().contains(jwtProvider.getExpectedAudience())) {
                UnauthorizedWriter.write(response, objectMapper, "INVALID_TOKEN", "Token 受众无效");
                return;
            }

            if (jwtProvider.isExpired(claims)) {
                UnauthorizedWriter.write(response, objectMapper, "TOKEN_EXPIRED", "Token 已过期");
                return;
            }

            UserIdHolder.set(jwtProvider.getUserId(claims));
            chain.doFilter(request, response);
        } finally {
            UserIdHolder.clear();
        }
    }
}
