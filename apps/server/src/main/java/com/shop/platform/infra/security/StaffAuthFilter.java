package com.shop.platform.infra.security;

import com.shop.platform.common.StaffContext;
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

/**
 * 平台员工鉴权过滤链：只处理 /admin/**（登录/刷新入口放行），校验 kind=staff 的 access token。
 *
 * <p>与 JwtAuthFilter 通过 skipPaths（/admin）互斥：员工 token 不会漏到用户链路，用户 token 进不了管理端。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 9)
@RequiredArgsConstructor
public class StaffAuthFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;
    private final ObjectMapper objectMapper;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 非规范路径（含编码等）不跳过，进 doFilterInternal 统一 400，防止前缀判断被绕过
        String path = RequestPaths.routePath(request);
        if (path == null) {
            return false;
        }
        // 只处理平台员工命名空间，两个发token的入口放行（命名空间判定与判权拦截器共用 RequestPaths）。
        // 豁免刻意比 ADMIN_SELF_SERVICE_PREFIX 窄：me / 登出必须带员工 token 才谈得上「自服务」
        if (!RequestPaths.inNamespace(path, RequestPaths.ADMIN_NAMESPACE)) return true;
        return path.startsWith(RequestPaths.ADMIN_SELF_SERVICE_PREFIX + "login")
                || path.startsWith(RequestPaths.ADMIN_SELF_SERVICE_PREFIX + "refresh");
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
            // 管理端链路：requireStaff=true，只收 kind=staff 的 access token
            BearerTokens.Verification verification = BearerTokens.verify(jwtProvider, request, true);
            if (verification.failed()) {
                UnauthorizedWriter.write(response, objectMapper, 401, verification.code(), verification.detail());
                return;
            }
            StaffContext.set(verification.subjectId());
            chain.doFilter(request, response);
        } finally {
            StaffContext.clear();
        }
    }
}
