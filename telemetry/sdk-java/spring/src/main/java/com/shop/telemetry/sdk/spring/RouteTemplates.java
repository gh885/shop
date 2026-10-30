package com.shop.telemetry.sdk.spring;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;

/**
 * 路由模板。**这一个类是为了控制基数**。
 *
 * <p>如果把真实 URL 当 transaction 名（{@code GET /api/orders/8821}），每个订单号都会生成一个
 * 独立的聚合维度：指标基数爆炸、issue 按订单号分成几千条、看板上全是"只出现过一次"的行。
 * 所以事件里记的必须是模板（{@code GET /api/orders/:id}）。
 *
 * <p>两条来源，优先级从高到低：
 *
 * <ol>
 *   <li>Spring MVC 已经算好的 {@code BEST_MATCHING_PATTERN_ATTRIBUTE}（Filter 在 handler 之后
 *       执行时能取到，最准）
 *   <li>兜底：把 URI 里的数字段和 UUID 形状的段替换成 {@code :id}
 * </ol>
 *
 * <p>兜底不是"能省就省"——有些异常发生在 handler mapping 之前（比如 Filter 自己抛的），
 * 那时拿不到模板，只能靠净化。
 */
final class RouteTemplates {

    private RouteTemplates() {}

    static String of(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern instanceof String matched && !matched.isBlank()) {
            return request.getMethod() + " " + matched;
        }
        return request.getMethod() + " " + sanitize(request.getRequestURI());
    }

    static String sanitize(String uri) {
        if (uri == null || uri.isEmpty()) {
            return "/";
        }
        String[] segments = uri.split("/");
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < segments.length; i++) {
            if (i > 0) {
                sb.append('/');
            }
            sb.append(isIdentifierLike(segments[i]) ? ":id" : segments[i]);
        }
        String result = sb.toString();
        return result.isEmpty() ? "/" : result;
    }

    private static boolean isIdentifierLike(String segment) {
        if (segment.isEmpty()) {
            return false;
        }
        if (isAllDigits(segment)) {
            return true;
        }
        return looksLikeUuid(segment);
    }

    private static boolean isAllDigits(String segment) {
        for (int i = 0; i < segment.length(); i++) {
            char c = segment.charAt(i);
            if (c < '0' || c > '9') {
                return false;
            }
        }
        return true;
    }

    /** 36 位带连字符（8-4-4-4-12）或 32 位纯十六进制。 */
    private static boolean looksLikeUuid(String segment) {
        int hexDigits = 0;
        for (int i = 0; i < segment.length(); i++) {
            char c = segment.charAt(i);
            if (c == '-') {
                continue;
            }
            boolean hex = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
            if (!hex) {
                return false;
            }
            hexDigits++;
        }
        return hexDigits == 32;
    }
}
