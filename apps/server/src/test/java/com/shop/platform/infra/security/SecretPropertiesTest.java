package com.shop.platform.infra.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;

/** SecretProperties 配置绑定单测：pepper 的默认值与传递语义。 */
class SecretPropertiesTest {

    @Test
    void 空串默认值_可被构建() {
        // @DefaultValue("") 与显式传空串等价：pepper 降级决策在 SecretHasher，不在属性层
        assertThatCode(() -> new SecretProperties("")).doesNotThrowAnyException();
    }

    @Test
    void 显式配置_原样传递() {
        assertThat(new SecretProperties("a".repeat(32)).pepper()).isEqualTo("a".repeat(32));
    }
}
