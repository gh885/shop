package com.shop.platform.common;

import lombok.AccessLevel;
import lombok.NoArgsConstructor;

/**
 * 文本归一化的共享契约：把「空串/纯空白」这类「看起来有值、其实是空的」输入统一收敛成 null，
 * 免得每个入参落库点各写一遍三元表达式（写法一散就会出现「有的 trim、有的不 trim」的口径漂移）。
 */
@NoArgsConstructor(access = AccessLevel.PRIVATE)
public final class Text {

    /** 空白（含 null）→ null，非空原样返回，不做 trim */
    public static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    /** trim 后为空（含 null）→ null，否则返回 trim 结果 */
    public static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
