package com.shop.platform.catalog.model;

import java.util.List;
import java.util.Locale;

/**
 * SPU 级识别键：用哪种键指认「这是不是同一个商品」。
 *
 * <p>四种，对应四象限。没有 {@code gtin} —— GTIN 是 SKU 粒度的键，一个颜色容量组合一个条码，
 * 挂在 SPU 上就是把键放错了层级。
 */
public enum IdentityKind {
    /** 型号。品牌标品：{@code APPLE:A3294} */
    MODEL_NO,
    /** 款号。品牌非标：{@code UNIQLO:466123}，会重号，归并要人工确认 */
    ARTICLE_NO,
    /** 参数哈希。白牌标品：四个识别属性拼出来的串 */
    PARAM_HASH,
    /** 认不出来。白牌非标，挂不上标准品 */
    NONE;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static IdentityKind from(String value) {
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知的识别键类型: " + value, e);
        }
    }

    public static List<String> allValues() {
        return List.of(MODEL_NO.dbValue(), ARTICLE_NO.dbValue(), PARAM_HASH.dbValue(), NONE.dbValue());
    }

    /** 参与拼识别键的类型（{@code none} 不参与）。 */
    public boolean isKey() {
        return this != NONE;
    }
}
