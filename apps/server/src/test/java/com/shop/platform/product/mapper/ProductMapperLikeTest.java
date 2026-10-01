package com.shop.platform.product.mapper;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProductMapperLikeTest {

    @Test
    void 搜索词里的通配符被转义_不再放大匹配范围() {
        assertThat(ProductMapper.escapeLike("%")).isEqualTo("\\%");
        assertThat(ProductMapper.escapeLike("_")).isEqualTo("\\_");
        assertThat(ProductMapper.escapeLike("100%")).isEqualTo("100\\%");
        assertThat(ProductMapper.escapeLike("A_B")).isEqualTo("A\\_B");
        assertThat(ProductMapper.escapeLike("\\")).isEqualTo("\\\\");
    }
}
