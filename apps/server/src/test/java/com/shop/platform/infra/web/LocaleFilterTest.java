package com.shop.platform.infra.web;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.FilterChain;
import java.util.Locale;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * {@link LocaleFilter} 的解析与清理。
 *
 * <p>本类钉三件事，前两件是解析规则，第三件是<b>清理</b>——后者不是细节：请求线程由线程池复用，
 * 漏清一次就会让下一个请求读到上一个请求的语言（前端 i18n §3.5 那条「跨请求串语言」在服务端的同一形状），
 * 而它的症状是「偶发地把 A 用户的内容发给 B 用户」，不报错、不可复现。所以这里显式跑两次请求：
 * 第一次给英文、第二次什么都不给，断言第二次回到平台默认——那正是「清理生效」的可观察形状。
 */
class LocaleFilterTest {

    private final LocaleFilter filter = new LocaleFilter();

    @AfterEach
    void 清干净别把ThreadLocal留给别的用例() {
        LocaleContextHolder.clear();
    }

    /** 链上观察到的语言与时区（观察点在 filter 的 finally 之前，所以能看见 Holder 的值） */
    private record Seen(Locale locale, String timezone) {}

    private Seen run(MockHttpServletRequest request) throws Exception {
        Seen[] seen = new Seen[1];
        filter.doFilter(
                request,
                new MockHttpServletResponse(),
                (req, res) -> seen[0] = new Seen(LocaleContextHolder.get(), LocaleContextHolder.getTimezone()));
        return seen[0];
    }

    private MockHttpServletRequest request() {
        return new MockHttpServletRequest("GET", "/api/products");
    }

    @Test
    void XLocale优先于AcceptLanguage() throws Exception {
        MockHttpServletRequest request = request();
        request.addHeader("X-Locale", "en-US");
        request.addHeader("Accept-Language", "zh-CN,zh;q=0.9");

        assertThat(run(request).locale()).isEqualTo(Locale.forLanguageTag("en-US"));
    }

    @Test
    void 没有XLocale时按AcceptLanguage的q权重取第一个能归一的() throws Exception {
        MockHttpServletRequest request = request();
        // 第一项不支持，按 q 降序跳过它取 zh
        request.addHeader("Accept-Language", "de-DE;q=0.9, zh-CN;q=0.8, en-US;q=0.1");

        assertThat(run(request).locale()).isEqualTo(Locale.forLanguageTag("zh-CN"));
    }

    @Test
    void 权重高的在前_不是按声明顺序() throws Exception {
        MockHttpServletRequest request = request();
        // en 写在后面但 q 更大
        request.addHeader("Accept-Language", "zh-CN;q=0.3, en-US;q=0.9");

        assertThat(run(request).locale()).isEqualTo(Locale.forLanguageTag("en-US"));
    }

    @Test
    void 什么都不给_落平台默认() throws Exception {
        assertThat(run(request()).locale()).isEqualTo(SupportedLocales.DEFAULT);
    }

    @Test
    void XLocale不可识别时不猜_继续看AcceptLanguage() throws Exception {
        MockHttpServletRequest request = request();
        request.addHeader("X-Locale", "xx-XX");
        request.addHeader("Accept-Language", "en-US");

        assertThat(run(request).locale()).isEqualTo(Locale.forLanguageTag("en-US"));
    }

    @Test
    void 畸形AcceptLanguage不抛_落默认() throws Exception {
        MockHttpServletRequest request = request();
        // q 不合法、空段、重复逗号：都不能让请求打成 500
        request.addHeader("Accept-Language", ";;, zh-CN;q=abc,,");

        assertThat(run(request).locale()).isEqualTo(Locale.forLanguageTag("zh-CN"));
    }

    @Test
    void 时区取自请求头() throws Exception {
        MockHttpServletRequest london = request();
        london.addHeader("X-Timezone", "Europe/London");

        assertThat(run(london).timezone()).isEqualTo("Europe/London");
    }

    @Test
    void 时区缺失或非法时落平台时区() throws Exception {
        assertThat(run(request()).timezone()).isEqualTo(SupportedLocales.PLATFORM_TIME_ZONE);

        MockHttpServletRequest bogus = request();
        bogus.addHeader("X-Timezone", "Not/AZone");
        assertThat(run(bogus).timezone()).isEqualTo(SupportedLocales.PLATFORM_TIME_ZONE);
    }

    @Test
    void 请求结束后必清_下一个请求不会读到上一个的语言() throws Exception {
        MockHttpServletRequest english = request();
        english.addHeader("X-Locale", "en-US");
        run(english);

        // 同一个线程（测试里就是当前线程）再跑一次什么都没给的请求
        MockHttpServletRequest plain = request();
        assertThat(run(plain).locale()).as("上一次请求的 en-US 不该漏到这里").isEqualTo(SupportedLocales.DEFAULT);
    }

    @Test
    void 链抛异常时也清() {
        MockHttpServletRequest request = request();
        request.addHeader("X-Locale", "en-US");
        FilterChain boom = (req, res) -> {
            throw new IllegalStateException("boom");
        };

        try {
            filter.doFilter(request, new MockHttpServletResponse(), boom);
        } catch (Exception ignored) {
            // 预期：链自己抛的
        }

        // 异常路径最容易漏 finally：这里断言它仍然被清掉
        assertThat(LocaleContextHolder.get()).isEqualTo(SupportedLocales.DEFAULT);
    }
}
