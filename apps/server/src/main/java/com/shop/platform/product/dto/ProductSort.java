package com.shop.platform.product.dto;

import com.shop.platform.common.BusinessException;
import java.util.Arrays;
import java.util.Locale;

/**
 * 买家侧商品列表的排序键（wire 值 = 枚举名的小写下划线：{@code newest} / {@code price_asc} / {@code price_desc}）。
 *
 * <p>词表原先抄在两处：{@code ProductQuery} 的 {@code @Pattern} 写一遍 alternation，
 * {@code ProductQueryService} 的 {@code switch} 再按字符串各写一遍 case——加一种排序要同时记起两处，
 * 漏掉的那处不会报错，只会把新值静默当成「默认排序」。现在枚举是唯一的一等公民：
 * 入站形状引用 {@link #PATTERN}，service 走 {@link #fromWire} 归一成枚举，ORDER BY 分支住在
 * {@code ProductMapper.selectPublicPage}（每种排序补 id 兜底那句也在那里）。
 */
public enum ProductSort {

    /** 新品优先（默认） */
    NEWEST,

    /** 价格升序（按 min_price） */
    PRICE_ASC,

    /** 价格降序（按 max_price） */
    PRICE_DESC;

    /**
     * 给 {@code @Pattern} 用的 alternation，值由枚举名按声明序小写化拼成。
     *
     * <p>写成字面量而不是拼接：注解元素值必须是编译期常量表达式。两者等价由
     * {@code ValidationVocabularyTest} 断言（加枚举值忘了改这里就红）。
     */
    public static final String PATTERN = "newest|price_asc|price_desc";

    /** 该枚举的 wire 值 */
    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }

    /**
     * 解析入站排序值：空白（含 null）= 默认 {@link #NEWEST}，非法值 400。
     *
     * <p>非法值本该被 {@code ProductQuery} 的 {@code @Pattern} 挡在门外，这里仍判一次是为了让「排序方式不支持」
     * 只有一种说法：service 被别的调用方（内部筛选、测试）直接调用时不会退回默认值，也不会漏成 500。
     */
    public static ProductSort fromWire(String raw) {
        if (raw == null || raw.isBlank()) {
            return NEWEST;
        }
        return Arrays.stream(values())
                .filter(sort -> sort.wireName().equals(raw))
                .findFirst()
                .orElseThrow(() -> BusinessException.badRequest("排序方式不支持"));
    }
}
