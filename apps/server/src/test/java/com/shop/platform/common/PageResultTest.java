package com.shop.platform.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** PageResult.map 契约：变形 records、total 原样带过、空页不塌。 */
class PageResultTest {

    @Test
    void 变形records_total保持不变() {
        PageResult<Integer> page = new PageResult<>(List.of(1, 2, 3), 42);

        PageResult<String> mapped = page.map(String::valueOf);

        assertThat(mapped.records()).containsExactly("1", "2", "3");
        assertThat(mapped.total()).isEqualTo(42);
    }

    @Test
    void 空records_仍返回空页() {
        PageResult<Integer> empty = new PageResult<>(List.of(), 0);

        assertThat(empty.map(x -> "v").records()).isEmpty();
        assertThat(empty.map(x -> "v").total()).isZero();
    }
}
