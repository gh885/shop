package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 客户端 IP 提取。所有限流（登录爆破、验证码轰炸）都以它为键。
 *
 * <p>安全默认值：只信 {@link HttpServletRequest#getRemoteAddr()}（TCP 对端地址，客户端伪造不了）。
 * X-Forwarded-For 首段是客户端自报的请求头，直连部署下盲信它等于让攻击者每次请求换一个「IP」，
 * 所有 IP 维度的限流整体失效。
 *
 * <p>仅当部署在可信反向代理之后时，才通过 {@code shop.web.trust-forwarded-for=true} 显式开启解析。
 * 开启后取 XFF <b>最右</b>一跳而不是首段：首段永远由客户端可控（哪怕代理是追加而非覆写），
 * 取首段等于把限流键的决定权交还攻击者；最右一跳是可信代理实际看到并对齐的地址，
 * 前提是代理链上只有这一层可信（多层代理应让最外层覆写整个头）。
 */
@Component
public class ClientIp {

    private final boolean trustForwardedFor;

    public ClientIp(@Value("${shop.web.trust-forwarded-for:false}") boolean trustForwardedFor) {
        this.trustForwardedFor = trustForwardedFor;
    }

    /** 客户端 IP：默认 remoteAddr；可信单层反代场景取 XFF 最右一跳 */
    public String of(HttpServletRequest request) {
        if (!trustForwardedFor) {
            return request.getRemoteAddr();
        }
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank() && !"unknown".equalsIgnoreCase(forwarded)) {
            String[] hops = forwarded.split(",");
            return hops[hops.length - 1].trim();
        }
        return request.getRemoteAddr();
    }
}
