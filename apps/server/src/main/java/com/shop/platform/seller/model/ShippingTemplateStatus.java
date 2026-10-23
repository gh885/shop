package com.shop.platform.seller.model;

import java.util.Locale;

/**
 * 运费模板的状态。
 *
 * <p>三态而不是两态：{@code draft} 是"还没给人看，随便改"；{@code active} 是"算价正在用它"；
 * {@code archived} 是"留档，只读"。
 *
 * <p>没有 draft 的时候，新建出来就得是 active——而 active 一旦被报价单引用，再改就是改历史证据。
 * 商家每调一次运费都得先建再删，中间还有一段"算价拿到的是半成品"的窗口。
 *
 * <p>库约束 {@code ck_shipping_status} 与这三个名字一一对应；库里存小写。
 */
public enum ShippingTemplateStatus {
    DRAFT,
    ACTIVE,
    ARCHIVED;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static ShippingTemplateStatus from(String raw) {
        return valueOf(raw.toUpperCase(Locale.ROOT));
    }

    /** 只有归档是终态。draft 和 active 都能改——改 active 会立刻影响下一次算价，这是商家要的效果。 */
    public boolean isReadOnly() {
        return this == ARCHIVED;
    }
}
