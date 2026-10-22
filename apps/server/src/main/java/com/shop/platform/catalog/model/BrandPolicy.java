package com.shop.platform.catalog.model;

import java.util.List;
import java.util.Locale;

/** 品牌策略：这个类目的商品要不要求品牌。 */
public enum BrandPolicy {
    REQUIRED,
    OPTIONAL,
    FORBIDDEN;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static BrandPolicy from(String value) {
        try {
            return valueOf(value.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("未知的品牌策略: " + value, e);
        }
    }

    public static List<String> allValues() {
        return List.of(REQUIRED.dbValue(), OPTIONAL.dbValue(), FORBIDDEN.dbValue());
    }
}
