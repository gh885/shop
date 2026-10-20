package com.shop.platform.infra.security.authz;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.infra.web.RequestPaths;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 判权拦截器：读 handler 上的 {@link RequirePermission}（方法覆盖类级），向各主体域的
 * {@link PermissionResolver} 收集当前请求主体的有效权限集，任一命中（含通配）放行，否则 403
 * {@code PERMISSION_DENIED}。
 *
 * <p>默认拒绝：受保护命名空间（清单见 {@link RequestPaths#GUARDED_NAMESPACES}）的 handler 缺注解一律
 * 拒绝；管理端自服务端点（登录/刷新/me/登出，只吃认证不吃授权）豁免。配合启动自检测试把漏标炸在开发期
 * （权限码表）。运行在过滤器链之后，StaffContext / ShopMemberContext 已就绪；
 * 注册顺序在日志拦截器之后，拒绝响应仍会被 http.request 事件记录。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class PermissionInterceptor implements HandlerInterceptor {

    private final List<PermissionResolver> resolvers;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        // 非控制器 handler（CORS 预检、静态资源等）不归判权管
        if (!(handler instanceof HandlerMethod hm)) {
            return true;
        }
        // 过滤器链对非规范路径统一 400，到不了这里；防御性放行保持职责单一
        String path = RequestPaths.routePath(request);
        if (path == null) {
            return true;
        }

        RequirePermission required =
                AnnotatedElementUtils.findMergedAnnotation(hm.getMethod(), RequirePermission.class);
        if (required == null) {
            required = AnnotatedElementUtils.findMergedAnnotation(hm.getBeanType(), RequirePermission.class);
        }

        if (required == null) {
            if (RequestPaths.inGuardedNamespace(path) && !RequestPaths.isAdminSelfService(path)) {
                log.warn("[AUTHZ] 受保护接口缺失权限注解（默认拒绝）, path={}, method={}", path, request.getMethod());
                throw BusinessException.forbidden(ErrorCodes.PERMISSION_DENIED, "接口未配置权限");
            }
            return true;
        }

        Set<String> granted = granted();
        // requested 权限码 ANY 语义：任一命中即通过；通配码恒通过
        boolean pass = granted.contains(PermissionResolver.WILDCARD)
                || Arrays.stream(required.value()).anyMatch(granted::contains);
        if (!pass) {
            log.warn("[AUTHZ] 判权拒绝, path={}, required={}", path, String.join(",", required.value()));
            throw BusinessException.forbidden(ErrorCodes.PERMISSION_DENIED, "没有执行该操作的权限");
        }
        return true;
    }

    /** 各域 resolver 按序认领，取第一个非 null 权限集；无人认领 = 无任何权限（fail-close） */
    private Set<String> granted() {
        for (PermissionResolver resolver : resolvers) {
            Set<String> permissions = resolver.permissions();
            if (permissions != null) {
                return permissions;
            }
        }
        return Set.of();
    }
}
