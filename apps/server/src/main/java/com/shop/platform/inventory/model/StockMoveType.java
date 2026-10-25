package com.shop.platform.inventory.model;

import java.util.Locale;

/**
 * 库存流水类型，与 {@code stock_ledger.type} 的库约束一一对应。
 *
 * <p>{@code commit} 不动任何科目列，只推预占状态——所以它的流水 {@code quantity} 恒为 0，
 * 库里那条 {@code ck_stock_ledger_commit} 就是拦这个的。
 */
public enum StockMoveType {
    RESERVE,
    COMMIT,
    SHIP,
    RELEASE,
    RESTOCK,
    ADJUST;

    public String dbValue() {
        return name().toLowerCase(Locale.ROOT);
    }

    public static StockMoveType from(String value) {
        return valueOf(value.toUpperCase(Locale.ROOT));
    }

    /** 这一类操作是否真的改了四个科目列。 */
    public boolean movesLedger() {
        return this != COMMIT;
    }
}
