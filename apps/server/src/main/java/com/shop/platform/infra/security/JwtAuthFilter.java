package com.shop.platform.infra.security;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.UserIdHolder;
import com.shop.platform.infra.web.FilterExceptionHandler;
import com.shop.platform.infra.web.RequestPaths;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 用户令牌链（买家 / 店主）：只收 kind=user。
 *
 * <p>与本过滤器并行的另外两条链：{@link StaffAuthFilter}（/admin，kind=staff）与
 * {@link SubaccountAuthFilter}（卖家子账号）。子账号链跑在本过滤器之前，命中后会在请求上打
 * {@link SubaccountAuthFilter#HANDLED_ATTRIBUTE} 标记，本过滤器据此让位——否则同一个子账号令牌
 * 会在这里被当成「类型错误」再拒一次。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
@RequiredArgsConstructor
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;
    private final JwtProperties jwtProperties;
    private final FilterExceptionHandler exceptionHandler;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 身份已由子账号链装载：这条请求不是用户身份，本链让位（同一条令牌不判两次）
        if (SubaccountAuthFilter.handled(request)) {
            return true;
        }
        // 非规范路径（含编码等）不跳过，进 doFilterInternal 统一 400，防止前缀判断被绕过
        String path = RequestPaths.routePath(request);
        if (path == null) {
            return false;
        }
        // 匿名白名单按前缀匹配（比判权的命名空间匹配更宽）：/admin 走员工过滤链，用户 token 不在此生效。
        // 两种匹配在真实路由上的分歧必须为零：落在「前缀命中而命名空间不命中」缝里的路由（如 /administrators）
        // 既匿名又无判权，由 PermissionVocabularyTest 逐条核对（权限码表）
        return jwtProperties.getSkipPaths().stream().anyMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = RequestPaths.routePath(request);
        try {
            if (path == null) {
                throw BusinessException.badRequest("非法请求路径");
            }
            // 用户链路：只收 kind=user（员工与子账号的 UUID 空间不能被当成 userId）
            BearerTokens.Verification verification = BearerTokens.verify(jwtProvider, request, Set.of(TokenKind.USER));
            if (verification.failed()) {
                throw BusinessException.unauthorized(verification.code(), verification.detail());
            }
            UserIdHolder.set(verification.subjectId());
            chain.doFilter(request, response);
        } catch (BusinessException ex) {
            exceptionHandler.resolve(request, response, ex);
        } finally {
            UserIdHolder.clear();
        }
    }
}
