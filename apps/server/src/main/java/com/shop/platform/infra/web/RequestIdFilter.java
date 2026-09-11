package com.shop.platform.infra.web;

import com.shop.platform.infra.observability.MdcScope;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    private static final String REQUEST_ID_ATTR = "__requestId__";
    private static final String HEADER_NAME = "x-request-id";

    private final String version;
    private final String env;

    public RequestIdFilter(
            @Value("${spring.application.version:unknown}") String version,
            @Value("${spring.application.env:dev}") String env) {
        this.version = version;
        this.env = env;
    }

    /** 32 位十六进制字符 */
    private static final Pattern UUID_HEX_PATTERN = Pattern.compile("^[0-9a-fA-F]{32}$");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        request.setAttribute(REQUEST_ID_ATTR, requestId);
        response.setHeader(HEADER_NAME, requestId);
        try (MdcScope _ = MdcScope.of("trace_id", requestId, "version", version, "env", env)) {
            chain.doFilter(request, response);
        }
    }

    /** 从入站头读取或生成请求 ID。格式规则见 docs/observability-checklist.md REQ-01/02。 */
    private static String resolveRequestId(HttpServletRequest request) {
        String incoming = request.getHeader(HEADER_NAME);
        if (incoming != null) {
            String stripped = incoming.replace("-", "");
            if (UUID_HEX_PATTERN.matcher(stripped).matches()) {
                return stripped;
            }
        }
        return UUID.randomUUID().toString().replace("-", "");
    }

    public static String getRequestId(HttpServletRequest request) {
        return (String) request.getAttribute(REQUEST_ID_ATTR);
    }
}
