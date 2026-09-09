package com.shop.platform.auth.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/**
 * 登录等时防护的格式不变式（LOGIN-01）—— 与 AuthService 同包，才够得着包级私有的占位哈希。
 *
 * <p>为什么值得单独钉一条：{@code BCryptPasswordEncoder.matches()} 先用正则校验哈希格式，不合法就打条
 * WARN 直接 return false，<b>KDF 根本不执行</b>。占位哈希一旦写坏，「用户不存在」瞬回而「密码错误」要跑满
 * BCrypt，响应耗时可区分，账号枚举面就重新打开了——而这种坏法编译期、运行期都不报错，只能靠断言拦。
 * 本仓库曾因手写 46 位零串（合法需 53 位）踩过：占位 139µs vs 真实 179ms，差 1289 倍。
 */
class DummyPasswordHashTest {

    /** 与 Spring BCryptPasswordEncoder 内部 BCRYPT_PATTERN 同款 */
    private static final String BCRYPT_PATTERN = "\\$2[ayb]\\$\\d{2}\\$[./0-9A-Za-z]{53}";

    @Test
    void 占位哈希是合法BCrypt串() {
        assertThat(AuthService.DUMMY_PASSWORD_HASH)
                .as("占位哈希不合法则 matches() 不进 KDF，等时防护失效")
                .matches(BCRYPT_PATTERN);
    }

    @Test
    void 占位哈希代价与编码器一致() {
        // 代价不一致时两条路径耗时仍可区分（cost 每 +1 耗时翻倍）
        assertThat(AuthService.DUMMY_PASSWORD_HASH).startsWith("$2a$" + PasswordEncoderConfig.BCRYPT_STRENGTH + "$");
    }

    @Test
    void 占位哈希不匹配任何口令() {
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(PasswordEncoderConfig.BCRYPT_STRENGTH);
        // 合法串才会真正进 KDF 比对；顺带确认它不会意外放行
        assertThat(encoder.matches("anything", AuthService.DUMMY_PASSWORD_HASH)).isFalse();
        assertThat(encoder.matches("", AuthService.DUMMY_PASSWORD_HASH)).isFalse();
    }
}
