package com.shop.platform.infra.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;
import org.springframework.web.util.WebUtils;

/**
 * refresh token 的 httpOnly cookie 读写（买家端 auth 与管理端 admin 共用）。
 *
 * <p>收拢的理由是安全属性不能有两份：{@code httpOnly} / {@code secure} / {@code sameSite} 原先在
 * AuthController 与 StaffAuthController 各写一遍，任何一次「只改一处」都会让其中一端悄悄降级。
 * 两端的差异全部外化成 {@link Spec}（cookie 名、作用路径、共享父域），行为本身只有一份。
 *
 * <p>作用域刻意收窄到各自的 refresh 端点路径：cookie 不会随普通 API 请求外发，
 * 减少被 XSS 之外的路径顺手带走的面。
 */
@Component
public class RefreshCookies {

    /** 7 天，与 {@code shop.jwt.refresh-token-expiration} 默认值对齐 */
    private static final Duration MAX_AGE = Duration.ofDays(7);

    /**
     * 一端的 cookie 身份。
     *
     * @param name cookie 名，两端必须不同（同域下 admin 与买家会话不得互相覆盖）
     * @param path 作用路径，收窄到该端的 refresh 端点
     * @param domain 共享父域；null / 空 = 不设 domain（本地开发，或刻意不跨子域共享）
     */
    public record Spec(String name, String path, String domain) {}

    /** 下发（登录 / 刷新后轮换） */
    public void issue(HttpServletResponse response, Spec spec, String refreshToken) {
        write(response, spec, refreshToken, MAX_AGE);
    }

    /** 清除（登出）：空值 + maxAge=0 */
    public void clear(HttpServletResponse response, Spec spec) {
        write(response, spec, "", Duration.ZERO);
    }

    /** 读取；不存在返回 null */
    public String read(HttpServletRequest request, Spec spec) {
        var cookie = WebUtils.getCookie(request, spec.name());
        return cookie == null ? null : cookie.getValue();
    }

    private void write(HttpServletResponse response, Spec spec, String value, Duration maxAge) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from(spec.name(), value)
                .httpOnly(true)
                .secure(true)
                .sameSite("Lax")
                .path(spec.path())
                .maxAge(maxAge);
        // 未配置时保持无 domain（本地开发）；配置后才跨子域共享会话
        if (spec.domain() != null && !spec.domain().isBlank()) {
            builder.domain(spec.domain());
        }
        response.addHeader(HttpHeaders.SET_COOKIE, builder.build().toString());
    }
}
