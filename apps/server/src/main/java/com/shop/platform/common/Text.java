package com.shop.platform.common;

/**
 * 文本归一化：把「空串/纯空白」这类看起来有值的输入统一收敛成 null，
 * 免得每个入参点各写一遍三元表达式（写法一散就会出现「有的 trim、有的不 trim」的口径漂移）。
 */
public final class Text {

    private Text() {}

    /** trim 后为空（含 null）→ null，否则返回 trim 结果 */
    public static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
