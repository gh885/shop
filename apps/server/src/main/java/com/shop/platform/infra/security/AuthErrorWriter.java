package com.shop.platform.infra.security;

import com.shop.platform.infra.db.JsonColumns;
import com.shop.platform.infra.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;

/**
 * 认证/鉴权失败也要吐统一的问题详情。
 *
 * <p>Spring Security 默认的 401 是空 body、403 是一段 HTML 错误页。前端拿不到 {@code code} 就无法区分
 * 「令牌过期」和「没权限」——主分支那边的客户端正是靠 {@code INVALID_TOKEN} 触发刷新重试的。
 *
 * <p>这里手写 JSON 而不是走 {@code HandlerExceptionResolver}：Security 的过滤器在 DispatcherServlet
 * 之前，异常到不了 {@code @RestControllerAdvice}。两者共用同一份键名和 {@code no-store} 约定。
 */
final class AuthErrorWriter {

    private AuthErrorWriter() {}

    static void write(HttpServletRequest request, HttpServletResponse response, int status, String code, String detail)
            throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json;charset=UTF-8");
        response.setHeader("Cache-Control", "no-store");

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", status);
        body.put("title", HttpStatus.valueOf(status).getReasonPhrase());
        body.put("detail", detail);
        body.put("code", code);
        body.put("requestId", RequestIdFilter.current());

        response.getWriter().write(JsonColumns.write(body));
    }
}
