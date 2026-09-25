package com.shop.platform.product.dto;

import com.shop.platform.common.BusinessException;
import java.util.Arrays;

/**
 * 卖家工作台商品列表的排序键（wire 值是 camelCase + 升降序后缀，取值集合见 {@link #PATTERN}）。
 *
 * <p>与买家侧 {@link ProductSort} 是两份词表，刻意不合并：那一边是「顾客怎么挑」（newest / price_asc /
 * price_desc），这一边是「商家怎么管」（创建时间 / 库存 / 累计销量），交集只有名字长得像，取值集合与
 * service 分支都不同形。前端的镜像在 {@code apps/seller/src/product/queries.ts} 的 {@code PRODUCT_SORTS}。
 *
 * <p>词表此前抄在两处：{@code ProductAdminController} 的 {@code @Pattern} 写一遍 alternation，
 * {@code ProductQueryService} 再按字符串各写一遍分支——加一种排序要同时记起两处，漏掉的那处不报错，
 * 只会把新值静默当成「按创建时间倒序」。现在枚举是唯一的一等公民：入站形状引用 {@link #PATTERN}，
 * service 走 {@link #fromWire} 归一成枚举，ORDER BY 那一档（连同库存两档不进 DB 分页的守卫）住在
 * {@code ProductMapper.selectPageByShop}；内存定序那半边留在 {@code ProductQueryService.pageListWithMetrics}。
 */
public enum ProductAdminSort {

    /** 最新创建优先（默认） */
    CREATED_AT_DESC("createdAt_desc", false),

    /** 最早创建优先 */
    CREATED_AT_ASC("createdAt_asc", false),

    /** 库存升序（先处理快卖空的） */
    STOCK_ASC("stock_asc", true),

    /** 库存降序（先处理爆款备货的） */
    STOCK_DESC("stock_desc", true),

    /** 累计销量升序 */
    SOLD_COUNT_ASC("soldCount_asc", false),

    /** 累计销量降序 */
    SOLD_COUNT_DESC("soldCount_desc", false);

    /**
     * 给 {@code @Pattern} 用的 alternation，取值按声明序拼成。
     *
     * <p>写成字面量而不是拼接：注解元素值必须是编译期常量表达式。两者等价由 {@code ValidationVocabularyTest}
     * 断言（加枚举值忘了补这里就红）。
     */
    public static final String PATTERN =
            "createdAt_desc|createdAt_asc|stock_asc|stock_desc|soldCount_asc|soldCount_desc";

    private final String wireName;

    /**
     * 是否按库存定序。库存是 {@code inventory} 的跨模块聚合量、不在 products 的列上，而本项目不许跨 schema
     * JOIN → DB 层排不出来，只能全量聚合后内存定序（口径见 {@code ProductQueryService.pageListWithMetrics}）。
     */
    private final boolean byAggregatedStock;

    ProductAdminSort(String wireName, boolean byAggregatedStock) {
        this.wireName = wireName;
        this.byAggregatedStock = byAggregatedStock;
    }

    /** 该枚举的 wire 值 */
    public String wireName() {
        return wireName;
    }

    /** 该排序键是否需要先把整店库存聚合完再定序（true = 不走 DB 分页） */
    public boolean byAggregatedStock() {
        return byAggregatedStock;
    }

    /**
     * 解析入站排序值：空白（含 null）= 默认 {@link #CREATED_AT_DESC}，非法值 400。
     *
     * <p>非法值本该被 controller 的 {@code @Pattern} 挡在门外成 422（GEN-19 第①条线），这里仍判一次是为了让
     * 「排序方式不支持」只有一种说法：service 被别的调用方（内部筛选、测试）直接调用时不会退回默认值，也不会漏成 500。
     */
    public static ProductAdminSort fromWire(String raw) {
        if (raw == null || raw.isBlank()) {
            return CREATED_AT_DESC;
        }
        return Arrays.stream(values())
                .filter(sort -> sort.wireName().equals(raw))
                .findFirst()
                .orElseThrow(() -> BusinessException.badRequest("排序方式不支持"));
    }
}
