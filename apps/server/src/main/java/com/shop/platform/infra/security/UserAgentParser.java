package com.shop.platform.infra.security;

import org.springframework.stereotype.Component;

/**
 * User-Agent → 人能读的设备名（设备列表展示用）。解析失败一律「未知设备」，不抛。
 *
 * <p>只做粗粒度归类（Chrome / Safari / 微信内置 …），不做指纹：这是给用户自己看的会话列表，
 * 不是风控特征采集。解析规则维持最简：第一段命中的客户端名 + OS 名，其余丢弃。
 */
@Component
public class UserAgentParser {

    public String parse(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return "未知设备";
        }
        String ua = userAgent.toLowerCase(java.util.Locale.ROOT);
        String browser;
        if (ua.contains("micromessenger")) {
            browser = "微信内置";
        } else if (ua.contains("edg/")) {
            browser = "Edge";
        } else if (ua.contains("chrome/") && !ua.contains("chromium")) {
            browser = "Chrome";
        } else if (ua.contains("safari/") && ua.contains("mobile/")) {
            browser = "Safari 移动端";
        } else if (ua.contains("safari/")) {
            browser = "Safari";
        } else if (ua.contains("firefox/")) {
            browser = "Firefox";
        } else {
            browser = "未知浏览器";
        }
        String os;
        if (ua.contains("windows")) {
            os = " Windows";
        } else if (ua.contains("iphone") || ua.contains("ipad")) {
            os = " iOS";
        } else if (ua.contains("android")) {
            os = " Android";
        } else if (ua.contains("mac os")) {
            os = " macOS";
        } else if (ua.contains("linux")) {
            os = " Linux";
        } else {
            os = "";
        }
        return browser + os;
    }
}
