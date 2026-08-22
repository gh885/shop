package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 过滤器用的请求路径规范化（JwtAuthFilter / StaffAuthFilter / ShopMembershipFilter 共用）。
 *
 * <p>Servlet 的 getRequestURI() 返回未解码原文，而 Spring MVC 按解码后的路径路由——直接拿原文做
 * startsWith("/admin") 这类前缀判断会被编码变体绕过（如 /%61dmin/** 解码后命中管理端路由）。
 * 因此凡原文与路由视角可能不一致的路径（百分号编码、路径参数、冗余斜杠、点号段）一律返回 null，
 * 由调用方统一 400 拒绝。本服务全部路由为纯 ASCII 字面量 + UUID 路径变量，检索关键词走查询串，
 * 拒绝不影响任何正常请求。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class RequestPaths {

    /**
     * 规范化请求路径（去 contextPath）；含不可安全前缀匹配的构造时返回 null。
     */
    public static String routePath(HttpServletRequest request) {
        String path = request.getRequestURI();
        String contextPath = request.getContextPath();
        if (!contextPath.isEmpty()) {
            path = path.substring(contextPath.length());
        }
        return isCanonical(path) ? path : null;
    }

    private static boolean isCanonical(String path) {
        // '%' 百分号编码（/%61dmin）、';' 路径参数（容器按段剥离）、'//' 冗余斜杠、
        // '.' / '..' 点号段（容器映射前归一化）：原文与路由视角不一致，一律拒绝
        if (path.indexOf('%') >= 0 || path.indexOf(';') >= 0 || path.contains("//")) {
            return false;
        }
        for (String segment : path.split("/")) {
            if (segment.equals(".") || segment.equals("..")) {
                return false;
            }
        }
        return true;
    }
}
