package com.shop.platform.infra;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * 配置资产回归：所有 application*.yml 必须能被 Boot 真实加载器无异常解析。
 *
 * <p>Spring Boot 4 的 {@link YamlPropertySourceLoader} 内部设了
 * {@code LoaderOptions.setAllowDuplicateKeys(false)}——同一键在文件里出现两次（如历史上
 * application-prod.yml 里 {@code shop.auth} 被写了两遍）会让 prod profile 启动即抛
 * {@code DuplicateKeyException}。本地 dev 只跑 application.yml，这类事故在合并/上线前毫无测试信号。
 * 本测直接用 Boot 自身的加载器逐文件解析，谁先炸谁知道。
 */
class ApplicationYamlTest {

    private final YamlPropertySourceLoader loader = new YamlPropertySourceLoader();

    @ParameterizedTest
    @ValueSource(strings = {"application.yml", "application-prod.yml"})
    void 每个配置文件_能被Boot加载器无异常解析(String name) {
        assertThatCode(() -> loader.load(name, new ClassPathResource(name)))
                .describedAs("%s 无法被 Boot 解析（DuplicateKey 或语法错误）", name)
                .doesNotThrowAnyException();
    }

    @Test
    void prod配置_关键键存在() throws Exception {
        // 生产必填的关键开关必须保留在键结构中（trust-forwarded-for / pepper / refresh-cookie-domain /
        // sms-channel）。漏配即启动失败是刻意设计，此测防止「顺手挪走键」的回归。
        List<PropertySource<?>> sources =
                loader.load("application-prod", new ClassPathResource("application-prod.yml"));
        List<String> keys = sources.stream()
                .filter(s -> s.getSource() instanceof Map<?, ?> m && !m.isEmpty())
                .map(s -> ((Map<?, ?>) s.getSource()).keySet())
                .flatMap(Set -> Set.stream().map(String::valueOf))
                .toList();

        assertThat(keys)
                .as("生产配置键结构")
                .contains(
                        "shop.web.trust-forwarded-for",
                        "shop.security.pepper",
                        "shop.auth.refresh-cookie-domain",
                        "shop.auth.sms-channel");
    }
}
