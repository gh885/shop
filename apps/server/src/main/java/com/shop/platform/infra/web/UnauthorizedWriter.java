package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import tools.jackson.databind.ObjectMapper;

/**
 * 鉴权过滤器直接写 problem+json 的公共出口（JwtAuthFilter / StaffAuthFilter / ShopMembershipFilter 共用）。
 *
 * <p>filter 层异常过不了 @RestControllerAdvice，只能手写响应；body 契约与 GlobalExceptionHandler 一致
 * （title/status/detail/requestId，code 可选），no-store 防止错误响应被缓存。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class UnauthorizedWriter {

    public static void write(
            HttpServletResponse response, ObjectMapper objectMapper, int status, String code, String detail)
            throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", HttpStatus.valueOf(status).getReasonPhrase());
        body.put("status", status);
        body.put("detail", detail);
        if (code != null) {
            body.put("code", code);
        }
        body.put("requestId", MDC.get("trace_id"));

        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
