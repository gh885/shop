package com.shop.platform.infra.web;

import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.config.YamlMapFactoryBean;
import org.springframework.core.io.ClassPathResource;

/**
 * 支持的语言与时区，读的是 {@code contracts/i18n.config.yaml}——前端 {@code pnpm i18n:gen} 也从这一份生成
 * {@code packages/i18n/src/config.gen.ts}。一个概念只有一份真源，加一门语言改一处。
 *
 * <p>由 pom 的 resources 把 {@code contracts/i18n.config.yaml} 复制进 classpath 根。
 *
 * <p>加载即校验：词表格式错了启动就失败，不留到第一个请求才炸。校验的是「这能不能用」，
 * 不是「写得对不对」——语言标签必须是合法 BCP 47、fallback 必须指向存在的语言且不能自指或重复。
 */
public final class SupportedLocales {

    private static final Map<String, Object> CONFIG = readConfig();

    private static final Map<?, ?> UI =
            requireMap(requireMap(CONFIG.get("contentTypes"), "contentTypes").get("ui"), "contentTypes.ui");

    /** 可选的语言标签清单。写入路径拿它当白名单，未列出的直接拒。 */
    public static final List<String> SUPPORTED = readSupported();

    public static final Locale SOURCE = configuredLocale(UI.get("sourceLocale"), "contentTypes.ui.sourceLocale");

    public static final Locale DEFAULT = configuredLocale(CONFIG.get("defaultLocale"), "defaultLocale");

    /** 平台单一展示时区（IANA zone id）。前端从同一份 yaml 生成常量。 */
    public static final String PLATFORM_TIME_ZONE = configuredZone(CONFIG.get("platformTimeZone"));

    private SupportedLocales() {}

    /** 入参是不是一个可选的语言。写入前用它挡，别让脏值进库。 */
    public static boolean isSupported(String tag) {
        return tag != null && SUPPORTED.contains(tag);
    }

    /**
     * 把客户端送来的语言标签归一到可选清单里的一个。
     *
     * <p>归一不是「模糊匹配」：{@code zh-CN} 归到 {@code zh-Hans-CN}（同语言同文字，只是没写 script），
     * 但 {@code zh-TW} 不会归过去（文字不同，是另一种书写系统，不该替用户选）。
     *
     * @return 归一后的标签，认不出返回 null——调用方决定是拒还是落默认
     */
    public static Locale normalize(String rawTag) {
        if (rawTag == null || rawTag.isBlank()) {
            return null;
        }
        Locale requested = Locale.forLanguageTag(rawTag.trim().replace('_', '-'));
        if (requested.getLanguage().isEmpty()) {
            return null;
        }
        String exact = requested.stripExtensions().toLanguageTag();
        if (SUPPORTED.contains(exact)) {
            return Locale.forLanguageTag(exact);
        }
        for (String tag : SUPPORTED) {
            Locale supported = Locale.forLanguageTag(tag);
            if (!supported.getLanguage().equals(requested.getLanguage())) {
                continue;
            }
            // 双方都声明了 script 却不同（zh-Hans vs zh-Hant）：不是同一个东西，不归一
            if (!requested.getScript().isEmpty()
                    && !supported.getScript().isEmpty()
                    && !requested.getScript().equals(supported.getScript())) {
                continue;
            }
            // 请求只给了国家码、候选声明了 script（zh-CN vs zh-Hans-CN）：比国家码
            if (requested.getScript().isEmpty()
                    && !requested.getCountry().isEmpty()
                    && !supported.getScript().isEmpty()
                    && !requested.getCountry().equals(supported.getCountry())) {
                continue;
            }
            return supported;
        }
        return null;
    }

    private static Map<String, Object> readConfig() {
        YamlMapFactoryBean factory = new YamlMapFactoryBean();
        factory.setResources(new ClassPathResource("i18n.config.yaml"));
        return Objects.requireNonNull(factory.getObject(), "i18n.config.yaml 不能为空");
    }

    private static Map<?, ?> requireMap(Object value, String field) {
        if (value instanceof Map<?, ?> map) {
            return map;
        }
        throw new IllegalStateException("i18n.config.yaml: " + field + " 应为映射");
    }

    private static List<String> readSupported() {
        if (!(UI.get("requireComplete") instanceof Boolean)) {
            throw new IllegalStateException("i18n.config.yaml: ui.requireComplete 必须是布尔值");
        }
        Map<?, ?> locales = requireMap(CONFIG.get("locales"), "locales");
        List<String> supported = new ArrayList<>();
        for (Map.Entry<?, ?> entry : locales.entrySet()) {
            if (!(entry.getKey() instanceof String tag)
                    || !Locale.forLanguageTag(tag).toLanguageTag().equals(tag)) {
                throw new IllegalStateException("i18n.config.yaml: 非法的语言标签 " + entry.getKey());
            }
            Map<?, ?> content = requireMap(requireMap(entry.getValue(), tag).get("content"), tag + ".content");
            if (content.containsKey("ui")) {
                supported.add(tag);
            }
        }
        if (supported.isEmpty()) {
            throw new IllegalStateException("i18n.config.yaml: 没有任何 UI 语言");
        }
        for (String tag : supported) {
            Map<?, ?> content = requireMap(requireMap(locales.get(tag), tag).get("content"), tag + ".content");
            Object fallback = requireMap(content.get("ui"), tag + ".ui").get("fallback");
            if (!(fallback instanceof List<?> targets)) {
                throw new IllegalStateException("i18n.config.yaml: " + tag + " 的 fallback 必须是列表");
            }
            HashSet<String> seen = new HashSet<>();
            for (Object target : targets) {
                if (!(target instanceof String value)
                        || value.equals(tag)
                        || !supported.contains(value)
                        || !seen.add(value)) {
                    throw new IllegalStateException("i18n.config.yaml: " + tag + " 的 fallback 非法: " + target);
                }
            }
        }
        return List.copyOf(supported);
    }

    private static Locale configuredLocale(Object value, String field) {
        if (value instanceof String tag && SUPPORTED.contains(tag)) {
            return Locale.forLanguageTag(tag);
        }
        throw new IllegalStateException("i18n.config.yaml: " + field + " 不是可选语言: " + value);
    }

    private static String configuredZone(Object value) {
        if (!(value instanceof String zone) || zone.isBlank()) {
            throw new IllegalStateException("i18n.config.yaml: platformTimeZone 不能为空");
        }
        try {
            ZoneId.of(zone);
        } catch (DateTimeException e) {
            throw new IllegalStateException("i18n.config.yaml: platformTimeZone 不是合法时区: " + zone, e);
        }
        return zone;
    }
}
