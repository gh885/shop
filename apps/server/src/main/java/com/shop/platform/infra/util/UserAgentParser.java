package com.shop.platform.infra.util;

import java.util.Locale;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * User-Agent → 可展示设备名的粗粒度解析（设备列表用）。
 *
 * <p>只做「看得懂」的归类，不做完整 UA 解析（那需要 ua-parser 类库）。规则覆盖常见
 * 移动/桌面浏览场景，识别不出的回退「未知设备」。避免把一串 UA 原文直接给用户看。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class UserAgentParser {

    /** 从 UA 头解析设备名，如 "iPhone Safari" / "Android Chrome" / "Windows Chrome" */
    public static String parse(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return "未知设备";
        }
        String ua = userAgent.toLowerCase(Locale.ROOT);

        // 操作系统 / 设备
        String os;
        if (ua.contains("iphone")) {
            os = "iPhone";
        } else if (ua.contains("android")) {
            os = "Android";
        } else if (ua.contains("mac os") || ua.contains("macintosh")) {
            os = "macOS";
        } else if (ua.contains("windows")) {
            os = "Windows";
        } else if (ua.contains("linux")) {
            os = "Linux";
        } else {
            os = "未知系统";
        }

        // 浏览器
        String browser;
        if (ua.contains("edg/")) {
            browser = "Edge";
        } else if (ua.contains("chrome/") && !ua.contains("crios")) {
            browser = "Chrome";
        } else if (ua.contains("firefox/")) {
            browser = "Firefox";
        } else if (ua.contains("safari/") && !ua.contains("chrome")) {
            browser = "Safari";
        } else if (ua.contains("micromessenger")) {
            browser = "微信";
        } else {
            browser = "浏览器";
        }

        return os + " " + browser;
    }
}
