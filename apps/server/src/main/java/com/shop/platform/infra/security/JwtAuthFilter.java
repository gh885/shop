package com.shop.platform.infra.security;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.web.RequestPaths;
import com.shop.platform.infra.web.UnauthorizedWriter;
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

    private final JwtProvider jwtProvider;
    private final JwtProperties jwtProperties;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 非规范路径（含编码等）不跳过，进 doFilterInternal 统一 400，防止前缀判断被绕过
        String path = RequestPaths.routePath(request);
        if (path == null) {
            return false;
        }
        // 匿名白名单按前缀匹配（比判权的命名空间匹配更宽）：/admin 走员工过滤链，用户 token 不在此生效。
        // 两种匹配在真实路由上的分歧必须为零：落在「前缀命中而命名空间不命中」缝里的路由（如 /administrators）
        // 既匿名又无判权，由 PermissionVocabularyTest 逐条核对（docs/conventions/permission-codes.md）
        return jwtProperties.getSkipPaths().stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = RequestPaths.routePath(request);
        if (path == null) {
            UnauthorizedWriter.write(response, objectMapper, 400, null, "非法请求路径");
            return;
        }
        try {
            // 用户链路：requireStaff=false，拒绝员工 token（staff UUID 不能被当成 userId）
            BearerTokens.Verification verification = BearerTokens.verify(jwtProvider, request, false);
            if (verification.failed()) {
                UnauthorizedWriter.write(response, objectMapper, 401, verification.code(), verification.detail());
                return;
            }
            UserIdHolder.set(verification.subjectId());
            chain.doFilter(request, response);
        } finally {
            UserIdHolder.clear();
        }
    }
}
