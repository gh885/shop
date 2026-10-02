package com.shop.platform.infra.web;

import java.util.List;
import java.util.Locale;

/**
 * 平台支持的语言——后端侧的镜像。
 *
 * <p>**它只服务两件事**（i18n.md §7.2）：动态内容按请求语言挑选、以及日志里那条 locale。UI 错误文案
 * 不归它——那条由前端 catalog 出、后端只给 code（§7.3），所以这里**不引入 {@code MessageSource}**。
 *
 * <p>**与前端 {@code SUPPORTED_LOCALES} 的关系**：两者必须逐条相等，由 {@code LocaleVocabularyTest}
 * 双向核（前端那侧是 TS 生成物，这里是常量）。加语言时两边一起改，少一边时那条用例红——这是
 * 「支持几种语言」在前后端各有一份清单时唯一能自动发现漂移的办法。
 */
public final class SupportedLocales {

    private SupportedLocales() {}

    /** 源语言（内容以它为准）；与前端 {@code SOURCE_LOCALE} 同口径 */
    public static final Locale SOURCE = Locale.forLanguageTag("zh-CN");

    /** 平台默认：请求没给可用语言时用它。与前端 {@code DEFAULT_LOCALE} 同口径 */
    public static final Locale DEFAULT = SOURCE;

    /** 展示时区：一期单一口径，与前端 {@code PLATFORM_TIME_ZONE} 相同字符串 */
    public static final String PLATFORM_TIME_ZONE = "Asia/Shanghai";

    /** 支持的语言标签（BCP 47），顺序即偏好顺序 */
    public static final List<String> SUPPORTED = List.of("zh-CN", "en-US");

    /**
     * 把一个语言标签（{@code zh_CN} / {@code zh-Hans-CN} / {@code EN-us}）归一到支持列表里的一项。
     *
     * <p>归一规则与前端 {@code normalizeLocale} 同一条：先按 {@code Locale.forLanguageTag} 解析（小写语言、
     * 正规化地区），再按「语言相同即可降级到该语言的地区变体」找一项。找不到返回 {@code null}，
     * 由调用方决定回落（Filter 落 {@link #DEFAULT}）——不在这里偷偷猜。
     */
    public static Locale normalize(String rawTag) {
        if (rawTag == null || rawTag.isBlank()) {
            return null;
        }
        Locale parsed = Locale.forLanguageTag(rawTag.trim().replace('_', '-'));
        if (parsed.getLanguage().isEmpty()) {
            return null;
        }
        for (String tag : SUPPORTED) {
            Locale supported = Locale.forLanguageTag(tag);
            if (supported.getLanguage().equals(parsed.getLanguage())) {
                return supported;
            }
        }
        return null;
    }
}
