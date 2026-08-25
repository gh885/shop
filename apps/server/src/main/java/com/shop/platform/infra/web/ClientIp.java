package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 客户端 IP 提取。
 *
 * <p>安全默认值：只信 {@link HttpServletRequest#getRemoteAddr()}（TCP 对端地址，客户端伪造不了）。
 * X-Forwarded-For 首段是客户端自报的请求头，直连部署下盲信它等于让攻击者每次请求换一个「IP」，
 * 所有 IP 维度的限流（短信轰炸、密码爆破防护）整体失效。
 *
 * <p>仅当部署在可信反向代理之后（代理负责覆写/追加 XFF）时，才通过
 * {@code shop.web.trust-forwarded-for=true} 显式开启首段解析。
 */
@Component
public class ClientIp {

    private final boolean trustForwardedFor;

    public ClientIp(@Value("${shop.web.trust-forwarded-for:false}") boolean trustForwardedFor) {
        this.trustForwardedFor = trustForwardedFor;
    }

    /** 客户端 IP：默认 remoteAddr；可信反代场景取 XFF 首段 */
    public String of(HttpServletRequest request) {
        if (!trustForwardedFor) {
            return request.getRemoteAddr();
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isEmpty() && !"unknown".equalsIgnoreCase(forwarded)) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
