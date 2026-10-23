package com.shop.platform.account;

import static org.assertj.core.api.Assertions.assertThat;

import com.shop.platform.infra.region.RegionRegistry;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** 区划注册表：码的存在性与「名称 → 码」反查是地址簿的两道地基，各自钉一条。 */
class RegionRegistryTest {

    private static RegionRegistry registry;

    @BeforeAll
    static void load() {
        registry = new RegionRegistry();
        registry.load();
    }

    @Test
    void 合法与非法的区划码() {
        assertThat(registry.isValidCode("440305")).isTrue();
        assertThat(registry.isValidCode("110105")).isTrue();
        assertThat(registry.isValidCode("999999")).isFalse();
        assertThat(registry.isValidCode(null)).isFalse();
    }

    @Test
    void 名称反查国标码() {
        assertThat(registry.resolveCode("广东省", "深圳市", "南山区")).isEqualTo("440305");
    }

    @Test
    void 直辖市容忍省市同名() {
        assertThat(registry.resolveCode("北京市", "北京市", "朝阳区")).isEqualTo("110105");
    }

    @Test
    void 未命中返回null交给前端补齐() {
        assertThat(registry.resolveCode("广东省", "深圳市", "不存在的区")).isNull();
    }
}
