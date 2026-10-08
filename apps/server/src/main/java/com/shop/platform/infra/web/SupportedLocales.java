package com.shop.platform.infra.web;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.config.YamlMapFactoryBean;
import org.springframework.core.io.ClassPathResource;

public final class SupportedLocales {

    private static final Map<String, Object> CONFIG = readConfig();
    private static final Map<?, ?> UI =
            requireMap(requireMap(CONFIG.get("contentTypes"), "contentTypes").get("ui"), "contentTypes.ui");

    public static final List<String> SUPPORTED = readSupported();
    public static final Locale SOURCE = configuredLocale(UI.get("sourceLocale"), "contentTypes.ui.sourceLocale");
    public static final Locale DEFAULT = configuredLocale(CONFIG.get("defaultLocale"), "defaultLocale");
    public static final String PLATFORM_TIME_ZONE = "Asia/Shanghai";

    private SupportedLocales() {}

    private static Map<String, Object> readConfig() {
        YamlMapFactoryBean factory = new YamlMapFactoryBean();
        factory.setResources(new ClassPathResource("i18n.config.yaml"));
        return Objects.requireNonNull(factory.getObject(), "i18n.config.yaml must not be empty");
    }

    private static Map<?, ?> requireMap(Object value, String field) {
        if (value instanceof Map<?, ?> map) return map;
        throw new IllegalStateException("i18n.config.yaml: expected mapping at " + field);
    }

    private static List<String> readSupported() {
        if (!(UI.get("requireComplete") instanceof Boolean)) {
            throw new IllegalStateException("i18n.config.yaml: ui.requireComplete must be boolean");
        }
        Map<?, ?> locales = requireMap(CONFIG.get("locales"), "locales");
        List<String> supported = new ArrayList<>();
        for (Map.Entry<?, ?> entry : locales.entrySet()) {
            if (!(entry.getKey() instanceof String tag)
                    || !Locale.forLanguageTag(tag).toLanguageTag().equals(tag)) {
                throw new IllegalStateException("i18n.config.yaml: invalid Locale " + entry.getKey());
            }
            Map<?, ?> content = requireMap(requireMap(entry.getValue(), tag).get("content"), tag + ".content");
            if (content.containsKey("ui")) supported.add(tag);
        }
        if (supported.isEmpty()) throw new IllegalStateException("i18n.config.yaml: no UI locales");
        for (String tag : supported) {
            Map<?, ?> content = requireMap(requireMap(locales.get(tag), tag).get("content"), tag + ".content");
            Object fallback = requireMap(content.get("ui"), tag + ".ui").get("fallback");
            if (!(fallback instanceof List<?> targets)) {
                throw new IllegalStateException("i18n.config.yaml: fallback must be a list for " + tag);
            }
            HashSet<String> seen = new HashSet<>();
            for (Object target : targets) {
                if (!(target instanceof String value)
                        || value.equals(tag)
                        || !supported.contains(value)
                        || !seen.add(value)) {
                    throw new IllegalStateException("i18n.config.yaml: invalid fallback for " + tag + ": " + target);
                }
            }
        }
        return List.copyOf(supported);
    }

    private static Locale configuredLocale(Object value, String field) {
        if (value instanceof String tag && SUPPORTED.contains(tag)) return Locale.forLanguageTag(tag);
        throw new IllegalStateException("i18n.config.yaml: unsupported " + field + ": " + value);
    }

    public static Locale normalize(String rawTag) {
        if (rawTag == null || rawTag.isBlank()) return null;
        Locale requested = Locale.forLanguageTag(rawTag.trim().replace('_', '-'));
        if (requested.getLanguage().isEmpty()) return null;
        String exact = requested.stripExtensions().toLanguageTag();
        if (SUPPORTED.contains(exact)) return Locale.forLanguageTag(exact);
        for (String tag : SUPPORTED) {
            Locale supported = Locale.forLanguageTag(tag);
            if (!supported.getLanguage().equals(requested.getLanguage())) continue;
            if (!requested.getScript().isEmpty()
                    && !supported.getScript().isEmpty()
                    && !requested.getScript().equals(supported.getScript())) continue;
            if (requested.getScript().isEmpty()
                    && !requested.getCountry().isEmpty()
                    && !supported.getScript().isEmpty()
                    && !requested.getCountry().equals(supported.getCountry())) continue;
            return supported;
        }
        return null;
    }
}
