package com.shop.platform.product;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.shop.platform.common.BusinessException;
import com.shop.platform.product.dto.ProductAdminSort;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * 卖家排序词表的行为：默认值、非法值、哪几档要退到内存定序。
 *
 * <p>「词表等于枚举 wire 值」「每个取值都有 switch 分支」这两条形不形在这里——它们是入站校验词表的门禁，
 * 归根包 {@code ValidationVocabularyTest}（GEN-52~64，一条规则一个家）。
 */
class ProductAdminSortTest {

    @Test
    void 空白取默认_非法值400() {
        assertThat(ProductAdminSort.fromWire(null)).isEqualTo(ProductAdminSort.CREATED_AT_DESC);
        assertThat(ProductAdminSort.fromWire(" ")).isEqualTo(ProductAdminSort.CREATED_AT_DESC);
        assertThat(ProductAdminSort.fromWire("stock_desc")).isEqualTo(ProductAdminSort.STOCK_DESC);
        // 400 这条线只管「service 被内部调用方直接调用」；HTTP 入口的非法值由 controller 的 @Pattern 拦成 422
        assertThatThrownBy(() -> ProductAdminSort.fromWire("sales_desc"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("排序方式不支持");
    }

    @Test
    void 库存两档是唯一要走全量聚合的键() {
        List<String> byAggregatedStock = Arrays.stream(ProductAdminSort.values())
                .filter(ProductAdminSort::byAggregatedStock)
                .map(Enum::name)
                .toList();
        // 口径写在 pageListWithMetrics 的注释里：库存不在 products 的列上，只有这两档排不了 DB
        assertThat(byAggregatedStock).containsExactly("STOCK_ASC", "STOCK_DESC");
    }
}
