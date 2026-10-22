package com.shop.platform.catalog.model;

import java.util.List;
import java.util.Locale;

/**
 * 属性值类型。
 *
 * <p>只有 {@code enum} 和 {@code number} 能当识别属性——自由文本进参数哈希，同款归并直接失效：
 * "TypeC" / "Type-C" / "USB-C" 是三个值，三条商品就成了三个同款。
 */
public enum ValueType {
    TEXT,
    NUMBER,
    ENUM,
    BOOL;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static ValueType from(String value) {
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知的属性值类型: " + value, e);
        }
    }

    public static List<String> allValues() {
        return List.of(TEXT.dbValue(), NUMBER.dbValue(), ENUM.dbValue(), BOOL.dbValue());
    }

    /** 能不能当识别属性。 */
    public boolean canBeIdentity() {
        return this == ENUM || this == NUMBER;
    }
}
