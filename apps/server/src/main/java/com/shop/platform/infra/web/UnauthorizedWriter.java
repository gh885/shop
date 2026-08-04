package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import tools.jackson.databind.ObjectMapper;

/** 鉴权过滤器直接写 401 problem+json 的公共出口（JwtAuthFilter / StaffAuthFilter 共用，与 GlobalExceptionHandler 同契约）。 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class UnauthorizedWriter {

    public static void write(HttpServletResponse response, ObjectMapper objectMapper, String code, String detail)
            throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "Unauthorized");
        body.put("status", 401);
        body.put("detail", detail);
        if (code != null) {
            body.put("code", code);
        }
        body.put("requestId", MDC.get("trace_id"));

        response.setStatus(401);
        response.setContentType("application/problem+json");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
