package com.shop.platform.infra;

import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.io.ClassPathResource;

/**
 * 配置资产回归：所有 application*.yml 必须能被 Boot 真实加载器无异常解析。
 *
 * <p>Spring Boot 的 {@link YamlPropertySourceLoader} 内部设了
 * {@code LoaderOptions.setAllowDuplicateKeys(false)}——同一键在文件里出现两次会让启动即抛
 * {@code DuplicateKeyException}。而 Spring 对 YAML 里<b>多出来的未知键</b>是静默忽略的：
 * 键挂错父节点（如把 {@code spring.data.redis} 写到 {@code shop.} 下）不报错、不生效，
 * 本地 dev 也只在启动时读过一次 application.yml。本测直接用 Boot 自身的加载器逐文件解析，
 * 谁先炸谁知道；键位归属这种「静默失效」它管不了，靠 review 与这份清单提醒。
 */
class ApplicationYamlTest {

    private final YamlPropertySourceLoader loader = new YamlPropertySourceLoader();

    @ParameterizedTest
    @ValueSource(strings = {"application.yml", "application-test.yml"})
    void 每个配置文件_能被Boot加载器无异常解析(String name) {
        assertThatCode(() -> loader.load(name, new ClassPathResource(name)))
                .describedAs("%s 无法被 Boot 解析（DuplicateKey 或语法错误）", name)
                .doesNotThrowAnyException();
    }
}
