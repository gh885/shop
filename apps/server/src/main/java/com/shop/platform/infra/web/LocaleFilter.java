package com.shop.platform.infra.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 把请求语言与时区解析进 {@link LocaleContextHolder}，请求结束必清。
 *
 * <p>**解析优先级：{@code X-Locale} &gt; {@code Accept-Language} &gt; 平台默认**。前两者是前端 {@code
 * contextHeaders} 发的（：钩子读装配注入的 localeScope，SSR 下走请求上下文），{@code X-Locale} 在前
 * 是因为它已经是**归一后的**应用语言（{@code zh-Hans-CN} / {@code en-US}），而 {@code Accept-Language} 是浏览器
 * 原样带上来的（可能是一长串 {@code en-US,en;q=0.9,zh-Hans-CN;q=0.8}，也可能被网关改写）。两个都认，前端换
 * 机制时后端不用跟着改。
 *
 * <p>**只服务动态内容与日志**（见 {@link LocaleContextHolder} 的理由），不接管任何错误文案——那是前端
 * catalog 的职责。
 *
 * <p>注册在 {@link RequestIdFilter} 之后：那个过滤器把 trace_id 放进 MDC，本过滤器记的 locale 与它
 * 落在同一条 {@code http.request} 事件上，两者都要在日志写出前就位。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class LocaleFilter extends OncePerRequestFilter {

    private static final String X_LOCALE_HEADER = "X-Locale";

    private static final String X_TIMEZONE_HEADER = "X-Timezone";

    private static final String ACCEPT_LANGUAGE_HEADER = "Accept-Language";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try {
            LocaleContextHolder.set(resolveLocale(request), resolveTimezone(request));
            chain.doFilter(request, response);
        } finally {
            // 请求线程会被线程池复用：漏清一次，下一个请求就会读到上一个请求的语言/时区
            LocaleContextHolder.clear();
        }
    }

    /** X-Locale &gt; Accept-Language（按 q 权重降序取第一个能归一的）&gt; 平台默认 */
    private Locale resolveLocale(HttpServletRequest request) {
        Locale explicit = SupportedLocales.normalize(request.getHeader(X_LOCALE_HEADER));
        if (explicit != null) {
            return explicit;
        }
        return acceptLanguageCandidates(request.getHeader(ACCEPT_LANGUAGE_HEADER)).stream()
                .map(SupportedLocales::normalize)
                .filter(locale -> locale != null)
                .findFirst()
                .orElse(SupportedLocales.DEFAULT);
    }

    /**
     * {@code Accept-Language} → 按 q 权重降序的语言标签列表。
     *
     * <p>解析不抛异常：畸形头（空 q、q > 1、重复逗号）直接跳过那一项。请求头是外部输入，解析失败
     * 不该变成 500——取不到就落默认语言，那已经是一个可用的答案。
     */
    private List<String> acceptLanguageCandidates(String header) {
        if (header == null || header.isBlank()) {
            return List.of();
        }
        return Arrays.stream(header.split(","))
                .map(String::trim)
                .map(LocaleFilter::parseAcceptLanguageEntry)
                .filter(Objects::nonNull)
                // q=0 是「明确不接受」，排到最后而不是直接丢：丢掉的话列表可能空，
                // 而空列表回落默认语言与「不接受 zh」在效果上相同，不必在解析层区分
                .sorted(Comparator.comparingDouble(WeightedTag::weight).reversed())
                .map(WeightedTag::tag)
                .toList();
    }

    /**
     * 解析一项 {@code tag;q=0.8}；<b>解不出语言标签就返回 null 整项跳过</b>。
     *
     * <p>返回 null 而不是抛，是这一层唯一的失败姿态：请求头是外部输入，{@code ";;, zh-Hans-CN;q=abc"}
     * 这类畸形值必须落回「按默认语言处理」而不是 500。
     *
     * <p>空 {@code parts} 是真实踩过的坑：{@code ";;".split(";")} 因 Java 丢弃尾部空串而返回**长度 0
     * 的数组**，直接取 {@code parts[0]} 会 {@code ArrayIndexOutOfBounds}（这条由
     * {@code LocaleFilterTest.畸形AcceptLanguage不抛_落默认} 钉住）。
     */
    private static WeightedTag parseAcceptLanguageEntry(String entry) {
        String[] parts = entry.split(";");
        if (parts.length == 0 || parts[0].isBlank()) {
            return null;
        }
        String tag = parts[0].trim();
        double weight = 1.0;
        for (int i = 1; i < parts.length; i++) {
            String param = parts[i].trim();
            if (param.startsWith("q=")) {
                try {
                    weight = Double.parseDouble(param.substring(2));
                } catch (NumberFormatException ignored) {
                    // q 不合法：按 1.0 处理（这一项仍可用），不因一个坏头丢掉整个语言
                }
            }
        }
        return new WeightedTag(tag, weight);
    }

    /** 请求声明的时区；缺失或不是合法 IANA 时区 ID 时给平台展示时区 */
    private String resolveTimezone(HttpServletRequest request) {
        String raw = request.getHeader(X_TIMEZONE_HEADER);
        if (raw == null || raw.isBlank()) {
            return SupportedLocales.PLATFORM_TIME_ZONE;
        }
        String candidate = raw.trim();
        return ZoneIds.isValid(candidate) ? candidate : SupportedLocales.PLATFORM_TIME_ZONE;
    }

    private record WeightedTag(String tag, double weight) {}
}
