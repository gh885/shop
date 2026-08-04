package com.shop.platform.admin.infra;

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

/**
 * 平台员工鉴权过滤链：只处理 /admin/**（登录/刷新入口放行），校验 kind=staff 的 access token。
 *
 * <p>与 JwtAuthFilter 通过 skipPaths（/admin）互斥：员工 token 不会漏到用户链路，用户 token 进不了管理端。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 9)
@RequiredArgsConstructor
public class StaffAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtProvider jwtProvider;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // 只处理平台员工命名空间，登录/刷新入口放行
        if (!path.startsWith("/admin")) return true;
        return path.startsWith("/admin/auth/login") || path.startsWith("/admin/auth/refresh");
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

            // 只接受员工 token（kind=staff），用户 token 不能访问 /admin/**
            if (!jwtProvider.isStaff(claims)) {
                UnauthorizedWriter.write(response, objectMapper, "INVALID_TOKEN", "Token 类型错误");
                return;
            }

            if (claims.getAudience() == null || !claims.getAudience().contains(jwtProvider.getExpectedAudience())) {
                UnauthorizedWriter.write(response, objectMapper, "INVALID_TOKEN", "Token 受众无效");
                return;
            }

            if (jwtProvider.isExpired(claims)) {
                UnauthorizedWriter.write(response, objectMapper, "TOKEN_EXPIRED", "Token 已过期");
                return;
            }

            StaffContext.set(jwtProvider.getUserId(claims));
            chain.doFilter(request, response);
        } finally {
            StaffContext.clear();
        }
    }
}
