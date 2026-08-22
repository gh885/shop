package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/** 客户端 IP 提取：反代场景优先 X-Forwarded-For 首段，否则 remoteAddr。 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class ClientIp {

    public static String of(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isEmpty() && !"unknown".equalsIgnoreCase(forwarded)) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
