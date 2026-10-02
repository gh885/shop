package com.shop.platform;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.web.SupportedLocales;
import com.shop.platform.testsupport.SourceScanner;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * 「支持哪几种语言」这件事前后端各有一份清单（前端 {@code packages/common/src/i18n/locale.ts} 的
 * {@code SUPPORTED_LOCALES}，后端 {@link SupportedLocales}），本类钉住它们相等。
 *
 * <p>**为什么需要它**：{@code LocaleFilter} 会按支持列表决定「这个 Accept-Language 认不认」，
 * 而前端 catalog 只装了那几种语言。少一边时表现是<b>静默的语言不一致</b>——后端把 {@code de-DE} 归到
 * 默认 zh-CN，于是动态内容给中文，而前端那条 {@code Vary} 缓存与 catalog 以为用户是别的语言；
 * 或者更常见的：前端加了 {@code ja-JP} 忘了改后端，于是新语言的请求全被归成中文，且没有任何报错。
 *
 * <p>**为什么不是生成物**：那份清单的判据是「能被人读懂并手改」——后端这里只有一个 List，
 * 前端那侧还要喂 {@code normalizeLocale} 的别名表与类型联合，生成反而多一层。两侧相等由本类核，
 * 加语言时两处一起改（改一处本类红）。
 *
 * <p>无库、不起 Spring：反射读常量 + 文本扫前端那一行。
 */
class LocaleVocabularyTest {

    /** 前端那行的形状：{@code export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const} */
    private static final Pattern SUPPORTED_LOCALES_DECL =
            Pattern.compile("export const SUPPORTED_LOCALES = \\[([^\\]]*)\\]");

    private static final Pattern QUOTED = Pattern.compile("'([^']+)'|\"([^\"]+)\"");

    /** 平台展示时区两侧同名同值：前端 {@code PLATFORM_TIME_ZONE} 与后端 {@code SupportedLocales.PLATFORM_TIME_ZONE} */
    private static final Path FRONTEND_LOCALE_TS = Path.of("packages", "common", "src", "i18n", "locale.ts");

    private static final Path FRONTEND_TIMEZONE_TS = Path.of("packages", "common", "src", "i18n", "timezone.ts");

    @Test
    void 支持语言两侧逐条相等() throws IOException {
        List<String> frontend = frontendSupportedLocales();
        List<String> backend = List.copyOf(SupportedLocales.SUPPORTED);

        assertThat(backend)
                .as("前后端支持语言必须逐条相等（顺序也计入：那是偏好顺序）。"
                        + "加语言时前端 packages/common/src/i18n/locale.ts 与后端 SupportedLocales.SUPPORTED 一起改")
                .containsExactlyElementsOf(frontend);
    }

    @Test
    void 默认语言与源语言都在支持列表里() {
        List<String> supported = List.copyOf(SupportedLocales.SUPPORTED);
        assertThat(supported)
                .as("默认语言必须是支持列表的一项，否则 LocaleFilter 的兜底给出一个「不支持」的语言")
                .contains(SupportedLocales.DEFAULT.toLanguageTag());
        assertThat(supported).as("源语言必须在支持列表里（内容以它为准）").contains(SupportedLocales.SOURCE.toLanguageTag());
    }

    @Test
    void 平台展示时区两侧同值() throws IOException {
        String frontend = readConstant(FRONTEND_TIMEZONE_TS, "PLATFORM_TIME_ZONE");
        assertThat(SupportedLocales.PLATFORM_TIME_ZONE)
                .as("时区口径必须前后端同一个字符串：展示层按它排日期（i18n.md §5.6），服务端按它理解「今天」")
                .isEqualTo(frontend);
    }

    @Test
    void 归一规则与前端一致() {
        // 这几条是前端 normalizeLocale 的同一批输入（i18n.md §3.2）。改一边时本类红，
        // 而不是让「zh_CN 这种写法在服务端被当未知语言静默丢掉」
        assertThat(SupportedLocales.normalize("zh_CN")).isEqualTo(Locale.forLanguageTag("zh-CN"));
        assertThat(SupportedLocales.normalize("zh-Hans-CN")).isEqualTo(Locale.forLanguageTag("zh-CN"));
        assertThat(SupportedLocales.normalize("en_US")).isEqualTo(Locale.forLanguageTag("en-US"));
        assertThat(SupportedLocales.normalize("EN")).isEqualTo(Locale.forLanguageTag("en-US"));
        // 不支持的：给 null 由调用方回落默认，不猜
        assertThat(SupportedLocales.normalize("de-DE")).isNull();
        assertThat(SupportedLocales.normalize("")).isNull();
        assertThat(SupportedLocales.normalize(null)).isNull();
        assertThat(SupportedLocales.normalize("!!")).isNull();
    }

    /** 读前端 {@code SUPPORTED_LOCALES} 里的语言标签（按声明顺序） */
    private List<String> frontendSupportedLocales() throws IOException {
        String source =
                SourceScanner.withoutComments(SourceScanner.read(SourceScanner.REPO_ROOT.resolve(FRONTEND_LOCALE_TS)));
        Matcher decl = SUPPORTED_LOCALES_DECL.matcher(source);
        assertThat(decl.find())
                .as("前端 %s 里没找到 SUPPORTED_LOCALES 声明", FRONTEND_LOCALE_TS)
                .isTrue();
        List<String> tags = new ArrayList<>();
        Matcher item = QUOTED.matcher(decl.group(1));
        while (item.find()) {
            tags.add(item.group(1) != null ? item.group(1) : item.group(2));
        }
        return tags;
    }

    /** 读前端 {@code export const NAME = '...'} 形式的字符串常量 */
    private String readConstant(Path relative, String name) throws IOException {
        String source = SourceScanner.read(SourceScanner.REPO_ROOT.resolve(relative));
        Matcher matcher =
                Pattern.compile("export const " + name + " = \"([^\"]+)\"").matcher(source);
        assertThat(matcher.find()).as("%s 里没找到 export const %s", relative, name).isTrue();
        return matcher.group(1);
    }
}
