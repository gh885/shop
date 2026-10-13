package com.shop.platform.infra.security;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.SubaccountContext;
import com.shop.platform.infra.web.FilterExceptionHandler;
import com.shop.platform.infra.web.RequestPaths;
import io.jsonwebtoken.Claims;
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
 * 卖家子账号令牌链（{@code kind=subaccount}）。与 {@link StaffAuthFilter} 同构，但覆盖两片路径：
 *
 * <ul>
 *   <li>{@code /seller/**} —— 子账号的<b>业务</b>请求。这一片同时接受用户令牌（店主），所以本链是
 *       「有条件接管」：令牌是子账号的就装载 {@link SubaccountContext} 并在请求上打
 *       {@link #HANDLED_ATTRIBUTE} 标记，让 {@link JwtAuthFilter} 让位；是用户令牌就什么都不做，
 *       照旧由用户链处理。
 *   <li>{@code /auth/subaccount/**} —— 子账号的<b>自助</b>端点（me / 登出 / 改密）。这一片已在
 *       {@code skipPaths} 里，用户链不看它，身份全靠本链（缺失即由 {@code @CurrentSubaccount} 解析器 401）。
 * </ul>
 *
 * <p>登录 / 刷新 / 激活 / 发码四格是匿名发放入口（凭密码或短信码换令牌），本链跳过——
 * 它们不能要求一个还不存在的令牌。
 *
 * <p>子账号令牌打买家侧接口（{@code /orders}、{@code /cart} 等）不会走到本链，那里由用户链以
 * 「Token 类型错误」拒掉：工作身份与私人身份不通用。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 8)
@RequiredArgsConstructor
public class SubaccountAuthFilter extends OncePerRequestFilter {

    /** 请求属性：本条请求的身份已由子账号链装载。跨过滤器握手用属性而不是 ThreadLocal——谁设的、谁读的写在同一条链上 */
    public static final String HANDLED_ATTRIBUTE = "shop.auth.subaccount.handled";

    private static final String BEARER_PREFIX = "Bearer ";

    /** 匿名发放入口：没有令牌也要能进 */
    private static final Set<String> ANONYMOUS_ISSUANCE = Set.of(
            RequestPaths.SUBACCOUNT_AUTH_PREFIX + "login",
            RequestPaths.SUBACCOUNT_AUTH_PREFIX + "refresh",
            RequestPaths.SUBACCOUNT_AUTH_PREFIX + "activate",
            RequestPaths.SUBACCOUNT_AUTH_PREFIX + "sms-code");

    private final JwtProvider jwtProvider;
    private final FilterExceptionHandler exceptionHandler;

    /** 本条请求是否已由子账号链装载身份（{@link JwtAuthFilter} 据此让位） */
    public static boolean handled(HttpServletRequest request) {
        return Boolean.TRUE.equals(request.getAttribute(HANDLED_ATTRIBUTE));
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // 非规范路径不跳过，进 doFilterInternal 统一 400，防止前缀判断被绕过
        String path = RequestPaths.routePath(request);
        if (path == null) {
            return false;
        }
        return !inScope(path) || ANONYMOUS_ISSUANCE.contains(path);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = RequestPaths.routePath(request);
        boolean claimed = false;
        try {
            if (path == null) {
                throw BusinessException.badRequest("非法请求路径");
            }
            // 1. 没有 Bearer 头就什么都不做：/seller 上的店主请求走用户链，/auth/subaccount 的自助端点由解析器 401
            String header = request.getHeader("Authorization");
            if (header == null || !header.startsWith(BEARER_PREFIX)) {
                chain.doFilter(request, response);
                return;
            }
            // 2. 不是子账号令牌也放行给用户链——「这令牌该不该被接受」不由本链替它回答
            Claims claims =
                    jwtProvider.parse(header.substring(BEARER_PREFIX.length()).trim());
            if (claims == null || jwtProvider.kindOf(claims) != TokenKind.SUBACCOUNT) {
                chain.doFilter(request, response);
                return;
            }
            // 3. 是子账号令牌：本链独占裁决（含过期/受众），失败给 401，前端据 code 决定是否刷新
            BearerTokens.Verification verification =
                    BearerTokens.verify(jwtProvider, request, Set.of(TokenKind.SUBACCOUNT));
            if (verification.failed()) {
                throw BusinessException.unauthorized(verification.code(), verification.detail());
            }
            SubaccountContext.set(verification.subjectId());
            request.setAttribute(HANDLED_ATTRIBUTE, Boolean.TRUE);
            claimed = true;
            chain.doFilter(request, response);
        } catch (BusinessException ex) {
            exceptionHandler.resolve(request, response, ex);
        } finally {
            if (claimed) {
                SubaccountContext.clear();
            }
        }
    }

    /** 本链覆盖的路径：卖家工作台（业务）与子账号自助端点 */
    private static boolean inScope(String path) {
        return RequestPaths.inNamespace(path, RequestPaths.SELLER_NAMESPACE)
                || path.startsWith(RequestPaths.SUBACCOUNT_AUTH_PREFIX);
    }
}
