package com.shop.platform.infra.web;

import java.util.Locale;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 当前请求的语言与时区（请求作用域，{@link LocaleFilter} 设值与清理）。
 *
 * <p>**存在的理由只有两条**，都不涉及 UI 错误文案：
 *
 * <ul>
 *   <li>动态内容按请求语言挑选（商品名 / CMS 词条的 entity_translation / JSONB，以及未来的邮件短信模板）
 *   <li>日志：{@code http.request} 事件带 locale，排查「这个用户为什么看到中文」时用得上
 * </ul>
 *
 * <p>**不用于本地化错误句子**：UI 错误文案归前端 catalog，后端出 code 不出句子。所以本类
 * 不提供「按语言取文案」的能力，避免它长成第二套文案系统。
 *
 * <p>ThreadLocal 与 {@code UserIdHolder} 同一形状，清理责任在 Filter 的 finally——请求线程被复用，
 * 漏清一次就会让下一个请求读到上一个请求的语言（与前端 「跨请求串语言」是同一类事故，
 * 只是发生在服务端线程池上）。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class LocaleContextHolder {

    private static final ThreadLocal<Locale> LOCALE = new ThreadLocal<>();

    private static final ThreadLocal<String> TIMEZONE = new ThreadLocal<>();

    public static void set(Locale locale, String timezone) {
        LOCALE.set(locale);
        TIMEZONE.set(timezone);
    }

    /** 请求语言；未设值时给平台默认（永不返回 null，调用点不必判空） */
    public static Locale get() {
        Locale locale = LOCALE.get();
        return locale == null ? SupportedLocales.DEFAULT : locale;
    }

    /** 请求声明的时区；未声明或非法时给平台展示时区 */
    public static String getTimezone() {
        String timezone = TIMEZONE.get();
        return timezone == null || timezone.isBlank() ? SupportedLocales.PLATFORM_TIME_ZONE : timezone;
    }

    public static void clear() {
        LOCALE.remove();
        TIMEZONE.remove();
    }
}
