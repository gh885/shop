package com.shop.telemetry.relay.auth;

import java.util.Locale;
import java.util.Optional;

/**
 * DSN 鉴权。
 *
 * <p>DSN 是**公开标识符**：它必然出现在打包后的前端代码里，所以它只表示"这条数据往哪个项目送"，
 * 不代表能读能改。真正的写保护在配额与 key 轮换（M2），不在 DSN 的保密性上。
 *
 * <p>接受两种形式，与 Sentry 协议一致：
 *
 * <pre>
 * X-Sentry-Auth: Sentry sentry_version=7, sentry_key=abc123, sentry_client=sentry.javascript.react/9.0.0
 * /api/1/envelope/?sentry_key=abc123
 * </pre>
 */
public final class DsnAuth {

    private static final String PREFIX = "sentry ";

    private DsnAuth() {}

    public static Optional<String> publicKey(String authHeader, String sentryKeyParam) {
        if (sentryKeyParam != null && !sentryKeyParam.isBlank()) {
            return Optional.of(sentryKeyParam.trim());
        }
        if (authHeader == null || authHeader.isBlank()) {
            return Optional.empty();
        }
        String normalized = authHeader.trim();
        if (normalized.toLowerCase(Locale.ROOT).startsWith(PREFIX)) {
            normalized = normalized.substring(PREFIX.length());
        }
        for (String part : normalized.split(",")) {
            int eq = part.indexOf('=');
            if (eq < 0) {
                continue;
            }
            String name = part.substring(0, eq).trim();
            if ("sentry_key".equals(name)) {
                String value = part.substring(eq + 1).trim();
                return value.isEmpty() ? Optional.empty() : Optional.of(value);
            }
        }
        return Optional.empty();
    }
}
