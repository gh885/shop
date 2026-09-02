package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

/**
 * HMAC 摘要单测：确定性（同 pepper 同输入同输出）、输入敏感性、pepper 长度闸门。
 * 这是短信验证码 / refresh token 落 Redis 前的脱敏原语。
 */
class SecretHasherTest {

    private static final String PEPPER = "a".repeat(32);

    /** 生产构造：配置注入路径（本测用 Spring 无关的 POJO，保持纯单测） */
    private static SecretHasher hasher(String pepper) {
        return new SecretHasher(new SecretProperties(pepper));
    }

    @Test
    void 同pepper同输入_摘要确定且为64位hex() {
        SecretHasher hasher = hasher(PEPPER);

        String h1 = hasher.hash("rt:abc123");
        String h2 = hasher.hash("rt:abc123");

        assertThat(h1).isEqualTo(h2);
        assertThat(h1).hasSize(64).matches("[0-9a-f]+");
    }

    @Test
    void 不同输入_摘要必不同() {
        SecretHasher hasher = hasher(PEPPER);

        assertThat(hasher.hash("123456")).isNotEqualTo(hasher.hash("123457"));
    }

    @Test
    void 换pepper_摘要必不同() {
        assertThat(hasher(PEPPER).hash("x")).isNotEqualTo(hasher("b".repeat(32)).hash("x"));
    }

    @Test
    void pepper过短_启动直接失败() {
        // 安全约束：短 pepper 让离线猜解成本骤降，宁可不启动
        assertThatThrownBy(() -> hasher("short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("32");
    }

    @Test
    void 未配置pepper_临时生成可用() {
        // 开发模式：临时 pepper，hash 正常工作即可
        assertThat(hasher("").hash("验证码123456")).hasSize(64);
    }
}
