package com.shop.platform.trust.api;

import java.util.Locale;

/**
 * 违规线索的种类。检测方报什么、trust 按什么处置，都在这一张清单上对齐；
 * 库里 {@code ck_clue_kind} 约束的值域和它一一对应。
 */
public enum ViolationKind {
    /** 承诺发货时间（付款 + 48h，见 fulfillment 的 OrderPaidHandler）到了还没发。 */
    SHIP_OVERDUE;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }
}
