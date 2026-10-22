package com.shop.platform.catalog.model;

import java.util.List;
import java.util.Locale;

/**
 * 类目状态。三档，语义不同：
 *
 * <ul>
 *   <li>{@code draft} —— 配置还没配齐，不能挂商品。属性模板、识别键、品牌策略任一缺失就停在这里。
 *   <li>{@code active} —— 正常可用。
 *   <li>{@code frozen} —— 禁新挂入，存量卖完为止。
 *   <li>{@code closed} —— 直接停卖，下单链路也拦。
 * </ul>
 *
 * <p>为什么必须有 {@code draft}：识别键和品牌策略是数据完整性的前提。配不全就挂商品，等于批量制造脏数据，
 * 而脏数据不可逆——标准品挂错了要人工一条条修。有了 draft，配置可以分几次填，但挂不了商品。
 */
public enum CategoryStatus {
    DRAFT,
    ACTIVE,
    FROZEN,
    CLOSED;

    /** 能不能往上挂商品。{@code frozen} 只拦新建，存量照卖，所以它对"新挂入"是拦的。 */
    public boolean mountable() {
        return this == ACTIVE;
    }

    /** 存量商品还能不能继续卖。{@code closed} 连下单都拦。 */
    public boolean sellable() {
        return this == ACTIVE || this == FROZEN;
    }

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static CategoryStatus from(String value) {
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知的类目状态: " + value, e);
        }
    }

    public static List<String> allValues() {
        return List.of(DRAFT.dbValue(), ACTIVE.dbValue(), FROZEN.dbValue(), CLOSED.dbValue());
    }
}
